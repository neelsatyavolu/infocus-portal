import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  contestFind: vi.fn(),
  contestCreate: vi.fn(),
  contestUpdate: vi.fn(),
  rowFind: vi.fn(),
  rowUpdate: vi.fn(),
  grantCreate: vi.fn(),
  loadHarvestBoard: vi.fn(),
  resolveStudentCycleNumber: vi.fn(),
  notify: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => {
  const tx = {
    thanksgivingContest: { create: mocks.contestCreate, update: mocks.contestUpdate },
    packageExtensionRequest: { create: mocks.grantCreate },
    packageProgressRow: { update: mocks.rowUpdate }
  };
  return {
    prisma: {
      thanksgivingContest: { findUnique: mocks.contestFind },
      packageProgressRow: { findFirst: mocks.rowFind },
      $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx)
    }
  };
});
vi.mock("@/src/server/thanksgiving-scores", () => ({ loadHarvestBoard: mocks.loadHarvestBoard }));
vi.mock("@/src/server/package-cycle-stage", () => ({ resolveStudentCycleNumber: mocks.resolveStudentCycleNumber }));
vi.mock("@/src/server/extension-grant-notify", () => ({ notifyGroupOfExtensionDecision: mocks.notify }));
vi.mock("@/src/lib/after-response", () => ({ afterResponse: (_: string, task: () => Promise<unknown>) => void task() }));

import { settleHarvestContest } from "@/src/server/thanksgiving-contest";

const BEFORE = new Date("2026-11-04T22:00:00-08:00");
const AFTER = new Date("2026-11-05T00:01:00-08:00");

function ranked(userId: string, total: number, rank: number) {
  return { userId, name: userId, leaves: total, pies: 0, wishbones: 0, giantTurkeys: 0, pardons: 0, total, rank };
}

describe("settleHarvestContest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contestFind.mockResolvedValue(null);
    mocks.resolveStudentCycleNumber.mockResolvedValue(3);
    mocks.grantCreate.mockImplementation(async ({ data }) => ({ id: `grant_${data.progressRowId}` }));
    mocks.notify.mockResolvedValue(null);
  });

  it("does nothing while the contest is open", async () => {
    await settleHarvestContest(BEFORE);
    expect(mocks.contestFind).not.toHaveBeenCalled();
    expect(mocks.grantCreate).not.toHaveBeenCalled();
  });

  it("does nothing once it has been locked in", async () => {
    mocks.contestFind.mockResolvedValue({ year: 2026 });
    await settleHarvestContest(AFTER);
    expect(mocks.loadHarvestBoard).not.toHaveBeenCalled();
  });

  it("grants the winner's whole group a pre-approved extension on top of what it has", async () => {
    mocks.loadHarvestBoard.mockResolvedValue({ year: 2026, rows: [ranked("abby", 40, 1), ranked("otto", 30, 2)] });
    mocks.rowFind.mockResolvedValue({
      id: "row1",
      cycleNumber: 3,
      extension: true,
      extensionRequests: [
        { requestedDays: 1, grantedDays: 1, grantedUserIds: [] },
        { requestedDays: 5, grantedDays: 5, grantedUserIds: ["otto"] }
      ]
    });

    await settleHarvestContest(AFTER);

    expect(mocks.contestCreate).toHaveBeenCalledWith({ data: { year: 2026, winnerUserIds: ["abby"], winningTotal: 40 } });
    expect(mocks.grantCreate).toHaveBeenCalledTimes(1);
    expect(mocks.grantCreate.mock.calls[0][0].data).toMatchObject({
      userId: "abby",
      progressRowId: "row1",
      cycleNumber: 3,
      grantedDays: 3,
      grantedUserIds: [],
      producerGranted: true,
      status: "APPROVED"
    });
    expect(mocks.rowUpdate).toHaveBeenCalledWith({ where: { id: "row1" }, data: { extension: true } });
    expect(mocks.contestUpdate).toHaveBeenCalledWith({ where: { year: 2026 }, data: { grantIds: ["grant_row1"] } });
    expect(mocks.notify).toHaveBeenCalledWith("grant_row1");
  });

  it("records a winner with no package group without granting anything", async () => {
    mocks.loadHarvestBoard.mockResolvedValue({ year: 2026, rows: [ranked("sage", 12, 1)] });
    mocks.rowFind.mockResolvedValue(null);
    await settleHarvestContest(AFTER);
    expect(mocks.contestCreate).toHaveBeenCalled();
    expect(mocks.grantCreate).not.toHaveBeenCalled();
  });

  it("gives tied winners in one group a single grant", async () => {
    mocks.loadHarvestBoard.mockResolvedValue({ year: 2026, rows: [ranked("abby", 9, 1), ranked("otto", 9, 1)] });
    mocks.rowFind.mockResolvedValue({ id: "row1", cycleNumber: 3, extension: false, extensionRequests: [] });
    await settleHarvestContest(AFTER);
    expect(mocks.grantCreate).toHaveBeenCalledTimes(1);
    expect(mocks.grantCreate.mock.calls[0][0].data).toMatchObject({ userId: "abby", grantedDays: 2 });
  });

  it("steps aside when another request locked it in first", async () => {
    mocks.loadHarvestBoard.mockResolvedValue({ year: 2026, rows: [ranked("abby", 9, 1)] });
    mocks.rowFind.mockResolvedValue({ id: "row1", cycleNumber: 3, extension: false, extensionRequests: [] });
    mocks.contestCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" })
    );
    await expect(settleHarvestContest(AFTER)).resolves.toBeUndefined();
    expect(mocks.grantCreate).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
