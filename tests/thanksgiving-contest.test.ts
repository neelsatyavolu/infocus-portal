import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  contestFind: vi.fn(),
  contestCreate: vi.fn(),
  contestUpdate: vi.fn(),
  contestUpdateMany: vi.fn(),
  rowFind: vi.fn(),
  rowFindMany: vi.fn(),
  rowUpdate: vi.fn(),
  grantCreate: vi.fn(),
  grantFindMany: vi.fn(),
  userFindMany: vi.fn(),
  loadHarvestBoard: vi.fn(),
  notify: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => {
  const tx = {
    thanksgivingContest: { update: mocks.contestUpdate, updateMany: mocks.contestUpdateMany },
    packageExtensionRequest: { create: mocks.grantCreate },
    packageProgressRow: { update: mocks.rowUpdate }
  };
  return {
    prisma: {
      thanksgivingContest: { findUnique: mocks.contestFind, create: mocks.contestCreate },
      packageProgressRow: { findFirst: mocks.rowFind, findMany: mocks.rowFindMany },
      packageExtensionRequest: { findMany: mocks.grantFindMany },
      user: { findMany: mocks.userFindMany },
      $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx)
    }
  };
});
vi.mock("@/src/server/thanksgiving-scores", () => ({ loadHarvestBoard: mocks.loadHarvestBoard }));
vi.mock("@/src/server/extension-grant-notify", () => ({ notifyGroupOfExtensionDecision: mocks.notify }));
vi.mock("@/src/lib/after-response", () => ({ afterResponse: (_: string, task: () => Promise<unknown>) => void task() }));

import { loadHarvestContest, prizeStatusFor, settleHarvestContest } from "@/src/server/thanksgiving-contest";

const DARK = new Date("2026-11-05T23:30:00-08:00");
const CLOSED = new Date("2026-11-06T00:01:00-08:00");
const REVEAL = new Date("2026-11-06T08:00:00-08:00");

function ranked(userId: string, total: number, rank: number) {
  return { userId, name: userId, leaves: total, goldenLeaves: 0, pies: 0, wishbones: 0, giantTurkeys: 0, pardons: 0, bonus: 0, total, rank };
}

function row(id: string, overrides: Record<string, unknown> = {}) {
  return { id, cycleNumber: 2, extension: false, finalCut: false, finalCutMediaItemId: null, extensionRequests: [], ...overrides };
}

describe("settleHarvestContest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contestFind.mockResolvedValue(null);
    mocks.contestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.grantCreate.mockImplementation(async ({ data }) => ({ id: `grant_${data.progressRowId}` }));
    mocks.notify.mockResolvedValue(null);
  });

  it("does nothing while the contest is open, even in the dark last hour", async () => {
    await settleHarvestContest(DARK);
    expect(mocks.contestFind).not.toHaveBeenCalled();
  });

  it("locks in the winners at the close but grants nothing until the reveal", async () => {
    mocks.loadHarvestBoard.mockResolvedValue({ year: 2026, rows: [ranked("abby", 40, 1), ranked("otto", 30, 2)] });
    mocks.contestFind.mockResolvedValueOnce(null).mockResolvedValueOnce({ winnerUserIds: ["abby"], revealedAt: null });
    await settleHarvestContest(CLOSED);
    expect(mocks.contestCreate).toHaveBeenCalledWith({ data: { year: 2026, winnerUserIds: ["abby"], winningTotal: 40 } });
    expect(mocks.contestUpdateMany).not.toHaveBeenCalled();
    expect(mocks.grantCreate).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("at the reveal, grants a Cycle 2 group still working its prize on top of what it has", async () => {
    mocks.contestFind.mockResolvedValue({ winnerUserIds: ["abby"], revealedAt: null });
    mocks.rowFind.mockResolvedValue(
      row("row1", {
        extension: true,
        extensionRequests: [
          { requestedDays: 1, grantedDays: 1, grantedUserIds: [] },
          { requestedDays: 5, grantedDays: 5, grantedUserIds: ["otto"] }
        ]
      })
    );
    await settleHarvestContest(REVEAL);
    expect(mocks.rowFind.mock.calls[0][0].where).toMatchObject({ cycleNumber: 2 });
    expect(mocks.contestUpdateMany).toHaveBeenCalledWith({ where: { year: 2026, revealedAt: null }, data: { revealedAt: REVEAL } });
    expect(mocks.grantCreate.mock.calls[0][0].data).toMatchObject({
      userId: "abby",
      progressRowId: "row1",
      cycleNumber: 2,
      grantedDays: 3,
      grantedUserIds: [],
      producerGranted: true,
      status: "APPROVED"
    });
    expect(mocks.rowUpdate).toHaveBeenCalledWith({ where: { id: "row1" }, data: { extension: true } });
    expect(mocks.contestUpdate).toHaveBeenCalledWith({ where: { year: 2026 }, data: { grantIds: ["grant_row1"] } });
    expect(mocks.notify).toHaveBeenCalledWith("grant_row1");
  });

  it("leaves the prize to pick when the winner's group already turned in its Final Cut", async () => {
    mocks.contestFind.mockResolvedValue({ winnerUserIds: ["abby"], revealedAt: null });
    mocks.rowFind.mockResolvedValue(row("row1", { finalCutMediaItemId: "media1" }));
    await settleHarvestContest(REVEAL);
    expect(mocks.contestUpdateMany).toHaveBeenCalled();
    expect(mocks.grantCreate).not.toHaveBeenCalled();
  });

  it("gives tied winners in one group a single grant", async () => {
    mocks.contestFind.mockResolvedValue({ winnerUserIds: ["abby", "otto"], revealedAt: null });
    mocks.rowFind.mockResolvedValue(row("row1"));
    await settleHarvestContest(REVEAL);
    expect(mocks.grantCreate).toHaveBeenCalledTimes(1);
    expect(mocks.grantCreate.mock.calls[0][0].data).toMatchObject({ userId: "abby", grantedDays: 2 });
  });

  it("reveals once: another request that claimed it first wins, and a revealed contest is left alone", async () => {
    mocks.contestFind.mockResolvedValue({ winnerUserIds: ["abby"], revealedAt: null });
    mocks.rowFind.mockResolvedValue(row("row1"));
    mocks.contestUpdateMany.mockResolvedValue({ count: 0 });
    await settleHarvestContest(REVEAL);
    expect(mocks.grantCreate).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.contestFind.mockResolvedValue({ winnerUserIds: ["abby"], revealedAt: REVEAL });
    await settleHarvestContest(REVEAL);
    expect(mocks.rowFind).not.toHaveBeenCalled();
    expect(mocks.contestUpdateMany).not.toHaveBeenCalled();
  });

  it("steps aside when another request locked the winners in first", async () => {
    mocks.loadHarvestBoard.mockResolvedValue({ year: 2026, rows: [ranked("abby", 9, 1)] });
    mocks.contestCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" })
    );
    await expect(settleHarvestContest(CLOSED)).resolves.toBeUndefined();
    expect(mocks.grantCreate).not.toHaveBeenCalled();
  });
});

describe("loadHarvestContest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is null until the reveal", async () => {
    mocks.contestFind.mockResolvedValue({ year: 2026, winnerUserIds: ["abby"], winningTotal: 40, grantIds: [], revealedAt: null });
    await expect(loadHarvestContest()).resolves.toBeNull();
  });

  it("names the winners and where each prize went", async () => {
    mocks.contestFind.mockResolvedValue({ year: 2026, winnerUserIds: ["abby"], winningTotal: 40, grantIds: ["g1"], revealedAt: REVEAL });
    mocks.userFindMany.mockResolvedValue([{ id: "abby", name: "Abby Example", nickname: "Abby" }]);
    mocks.grantFindMany.mockResolvedValue([{ userId: "abby", progressRow: { groupTopic: "Robotics", members: [{ userId: "sage" }] } }]);
    mocks.rowFindMany.mockResolvedValue([{ members: [{ userId: "abby" }] }]);
    await expect(loadHarvestContest()).resolves.toEqual({
      winners: [{ userId: "abby", name: "Abby", prize: { kind: "gifted", to: "Robotics" } }],
      total: 40
    });
  });
});

describe("prizeStatusFor", () => {
  const own = { userId: "abby", progressRow: { groupTopic: "Garden", members: [{ userId: "abby" }, { userId: "otto" }] } };

  it("tells apart the winner's own group, a gift, a choice still to make and no group", () => {
    expect(prizeStatusFor("otto", [own], true)).toEqual({ kind: "own-group" });
    expect(prizeStatusFor("sage", [{ userId: "sage", progressRow: { groupTopic: "Robotics", members: [] } }], true)).toEqual({
      kind: "gifted",
      to: "Robotics"
    });
    expect(prizeStatusFor("sage", [], true)).toEqual({ kind: "choosing" });
    expect(prizeStatusFor("sage", [], false)).toEqual({ kind: "no-group" });
  });
});
