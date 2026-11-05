import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadHarvestContest: vi.fn(),
  queryRaw: vi.fn(),
  contestFind: vi.fn(),
  contestUpdate: vi.fn(),
  grantCount: vi.fn(),
  grantCreate: vi.fn(),
  rowFind: vi.fn(),
  rowFindMany: vi.fn(),
  rowUpdate: vi.fn(),
  notify: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => {
  const tx = {
    $queryRaw: mocks.queryRaw,
    thanksgivingContest: { findUnique: mocks.contestFind, update: mocks.contestUpdate },
    packageExtensionRequest: { count: mocks.grantCount, create: mocks.grantCreate },
    packageProgressRow: { findFirst: mocks.rowFind, update: mocks.rowUpdate }
  };
  return {
    prisma: {
      packageProgressRow: { findMany: mocks.rowFindMany },
      $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx)
    }
  };
});
vi.mock("@/src/server/thanksgiving-contest", () => ({ loadHarvestContest: mocks.loadHarvestContest }));
vi.mock("@/src/server/extension-grant-notify", () => ({ notifyGroupOfExtensionDecision: mocks.notify }));
vi.mock("@/src/lib/after-response", () => ({ afterResponse: (_: string, task: () => Promise<unknown>) => void task() }));

import { givePrize, loadPrizeChoosers, loadPrizeOptions } from "@/src/server/thanksgiving-prize";

const NOW = new Date("2026-11-06T09:00:00-08:00");
const RESULT = {
  total: 40,
  winners: [
    { userId: "abby", name: "Abby", prize: { kind: "choosing" } },
    { userId: "otto", name: "Otto", prize: { kind: "own-group" } }
  ]
};
const WORKING = { id: "row2", cycleNumber: 2, extension: false, finalCut: false, finalCutMediaItemId: null, extensionRequests: [] };

describe("loadPrizeChoosers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists a winner still to pick for themselves, every one for an exec, nobody before the reveal", async () => {
    mocks.loadHarvestContest.mockResolvedValue(RESULT);
    await expect(loadPrizeChoosers("abby", false)).resolves.toEqual([{ userId: "abby", name: "Abby" }]);
    await expect(loadPrizeChoosers("sage", false)).resolves.toEqual([]);
    await expect(loadPrizeChoosers("sage", true)).resolves.toEqual([{ userId: "abby", name: "Abby" }]);
    mocks.loadHarvestContest.mockResolvedValue(null);
    await expect(loadPrizeChoosers("abby", false)).resolves.toEqual([]);
  });
});

describe("loadPrizeOptions", () => {
  it("lists Cycle 2 groups that haven't turned in, by topic", async () => {
    mocks.rowFindMany.mockResolvedValue([
      { id: "b", groupTopic: "Robotics", members: [{ user: { name: "Sage Example", nickname: null } }] },
      { id: "a", groupTopic: " ", members: [{ user: { name: null, nickname: "Otto" } }] }
    ]);
    await expect(loadPrizeOptions()).resolves.toEqual([
      { id: "b", topic: "Robotics", members: ["Sage Example"] },
      { id: "a", topic: "Untitled package", members: ["Otto"] }
    ]);
    expect(mocks.rowFindMany.mock.calls[0][0].where).toMatchObject({ cycleNumber: 2, finalCut: false, finalCutMediaItemId: null });
  });
});

describe("givePrize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadHarvestContest.mockResolvedValue(RESULT);
    mocks.contestFind.mockResolvedValue({ grantIds: ["g0"] });
    mocks.grantCount.mockResolvedValue(0);
    mocks.rowFind.mockResolvedValue(WORKING);
    mocks.grantCreate.mockResolvedValue({ id: "g1" });
    mocks.notify.mockResolvedValue(null);
  });

  it("gives the winner's days to the group they picked and tells that group", async () => {
    await expect(givePrize({ winnerId: "abby", rowId: "row2", byUserId: "abby", admin: false, now: NOW })).resolves.toEqual({ grantId: "g1" });
    expect(mocks.queryRaw).toHaveBeenCalled();
    expect(mocks.grantCreate.mock.calls[0][0].data).toMatchObject({
      userId: "abby",
      progressRowId: "row2",
      cycleNumber: 2,
      grantedDays: 2,
      grantedUserIds: [],
      status: "APPROVED"
    });
    expect(mocks.grantCreate.mock.calls[0][0].data.reason).toMatch(/^Thanksgiving leaderboard prize from Abby/);
    expect(mocks.contestUpdate).toHaveBeenCalledWith({ where: { year: 2026 }, data: { grantIds: ["g0", "g1"] } });
    expect(mocks.notify).toHaveBeenCalledWith("g1");
  });

  it("lets an exec pick for the winner, nobody else", async () => {
    await expect(givePrize({ winnerId: "abby", rowId: "row2", byUserId: "exec", admin: true, now: NOW })).resolves.toEqual({ grantId: "g1" });
    await expect(givePrize({ winnerId: "abby", rowId: "row2", byUserId: "sage", admin: false, now: NOW })).rejects.toThrow(
      "Only the winner can choose"
    );
  });

  it("refuses a second gift, a winner with nothing to pick, or a group that already turned in", async () => {
    mocks.grantCount.mockResolvedValue(1);
    await expect(givePrize({ winnerId: "abby", rowId: "row2", byUserId: "abby", admin: false, now: NOW })).rejects.toThrow("already been given");
    await expect(givePrize({ winnerId: "otto", rowId: "row2", byUserId: "otto", admin: false, now: NOW })).rejects.toThrow("already been given");
    mocks.grantCount.mockResolvedValue(0);
    mocks.rowFind.mockResolvedValue({ ...WORKING, finalCut: true });
    await expect(givePrize({ winnerId: "abby", rowId: "row2", byUserId: "abby", admin: false, now: NOW })).rejects.toThrow("hasn't turned in");
    expect(mocks.grantCreate).not.toHaveBeenCalled();
  });
});
