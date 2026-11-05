import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  catchFindMany: vi.fn(),
  catchFindFirst: vi.fn(),
  catchCreateMany: vi.fn(),
  catchCount: vi.fn(),
  scoreUpsert: vi.fn(),
  scoreFindUnique: vi.fn(),
  scoreUpdate: vi.fn(),
  catchGroupBy: vi.fn()
}));

// A test harvest hour on Wednesday 10:30–11:30 AM Pacific, ending half an hour before NOW (noon).
vi.mock("@/src/server/thanksgiving-harvest-hour", () => ({
  harvestHour: () => ({ startsAt: new Date("2026-11-04T10:30:00-08:00"), endsAt: new Date("2026-11-04T11:30:00-08:00") })
}));

vi.mock("@/src/lib/prisma", () => {
  const client = {
    $queryRaw: mocks.queryRaw,
    thanksgivingCatch: {
      findMany: mocks.catchFindMany,
      findFirst: mocks.catchFindFirst,
      createMany: mocks.catchCreateMany,
      count: mocks.catchCount,
      groupBy: mocks.catchGroupBy
    },
    thanksgivingScore: { upsert: mocks.scoreUpsert, findUnique: mocks.scoreFindUnique, update: mocks.scoreUpdate }
  };
  return { prisma: { ...client, $transaction: (run: (tx: typeof client) => Promise<unknown>) => run(client) } };
});

import { EMPTY_HARVEST, rankBoard } from "@/src/lib/thanksgiving-board";
import { carryOverHarvest, CARRY_OVER_CAP, loadPastRanks, recordCatches } from "@/src/server/thanksgiving-scores";

const NOW = new Date("2026-11-04T12:00:00-08:00");
const t = NOW.getTime();

describe("recordCatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.catchFindMany.mockResolvedValue([]);
    mocks.catchCount.mockResolvedValue(0);
    mocks.scoreFindUnique.mockResolvedValue({ id: "score1", flaggedAt: null, reviewClearedAt: null });
  });

  it("logs every verdict but adds only accepted catches to the totals", async () => {
    const result = await recordCatches(
      "abby",
      {
        sentAt: t,
        automation: false,
        catches: [
          { kind: "leaves", at: t - 4_000, age: 2_000 },
          { kind: "leaves", at: t - 3_000, age: 30 },
          { kind: "pies", at: t - 2_000, age: 1_500 }
        ]
      },
      NOW
    );
    expect(result).toEqual({ accepted: 2, rejected: 1 });
    expect(mocks.queryRaw).toHaveBeenCalled();
    const logged = mocks.catchCreateMany.mock.calls[0][0].data;
    expect(logged.map((row: { kind: string; accepted: boolean; reason: string | null }) => [row.kind, row.accepted, row.reason])).toEqual([
      ["leaves", true, null],
      ["leaves", false, "inhuman-reaction"],
      ["pies", true, null]
    ]);
    expect(logged[0]).toMatchObject({ userId: "abby", year: 2026, reactionMs: 2_000 });
    expect(mocks.scoreUpsert.mock.calls[0][0].update).toMatchObject({
      leaves: { increment: 1 },
      pies: { increment: 1 },
      bonus: { increment: 0 }
    });
    expect(mocks.scoreUpdate).not.toHaveBeenCalled();
  });

  it("counts golden leaves on their own and doubles catches made in harvest hour", async () => {
    // The clock check keeps catches within half an hour, so "now" is inside the hour here.
    const during = new Date("2026-11-04T11:10:00-08:00");
    const at = during.getTime();
    await recordCatches(
      "otto",
      {
        sentAt: at,
        automation: false,
        catches: [
          { kind: "goldenLeaves", at: at - 3_000, age: 2_000 },
          { kind: "leaves", at: at - 2_000, age: 2_000 }
        ]
      },
      during
    );
    expect(mocks.scoreUpsert.mock.calls[0][0].update).toMatchObject({
      goldenLeaves: { increment: 1 },
      leaves: { increment: 1 },
      bonus: { increment: 6 }
    });
  });

  it("doesn't flag catches over the rate limits; they just don't count", async () => {
    mocks.catchCount.mockImplementation(async ({ where }) => (where.reason === "rate-limit" ? 500 : 0));
    await recordCatches("sage", { sentAt: t, automation: false, catches: [{ kind: "pies", at: t - 1_000, age: 2_000 }] }, NOW);
    expect(mocks.scoreUpdate).not.toHaveBeenCalled();
  });

  it("flags the account once bot-like rejections pile up", async () => {
    mocks.catchCount.mockImplementation(async ({ where }) => (where.reason === "rate-limit" ? 0 : 9));
    await recordCatches("otto", { sentAt: t, automation: true, catches: [{ kind: "leaves", at: t - 1_000, age: 900 }] }, NOW);
    expect(mocks.scoreUpdate).toHaveBeenCalledWith({
      where: { id: "score1" },
      data: { flaggedAt: expect.any(Date), flagReason: expect.stringMatching(/no person/) }
    });
  });
});

describe("carryOverHarvest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.catchFindFirst.mockResolvedValue(null);
  });

  it("caps a browser's saved counts and takes them once", async () => {
    await carryOverHarvest("sage", { leaves: 2_000, pies: 3 }, NOW);
    expect(mocks.scoreUpsert.mock.calls[0][0].update).toEqual({
      leaves: { increment: CARRY_OVER_CAP.leaves },
      pies: { increment: 3 }
    });
    mocks.catchFindFirst.mockResolvedValue({ id: "earlier" });
    mocks.scoreUpsert.mockClear();
    await carryOverHarvest("sage", { leaves: 10, pies: 0 }, NOW);
    expect(mocks.scoreUpsert).not.toHaveBeenCalled();
  });
});

describe("loadPastRanks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ranks each person by what they had 24 hours ago, doubling harvest hour and marking newcomers missing", async () => {
    const later = new Date("2026-11-05T12:30:00-08:00");
    const rows = rankBoard([
      { ...EMPTY_HARVEST, bonus: 0, userId: "abby", name: "Abby", leaves: 50 },
      { ...EMPTY_HARVEST, bonus: 0, userId: "otto", name: "Otto", leaves: 40 },
      { ...EMPTY_HARVEST, bonus: 0, userId: "sage", name: "Sage", leaves: 30 }
    ]);
    mocks.catchGroupBy.mockImplementation(async ({ where }) =>
      where.source === "play"
        ? [{ userId: "otto", kind: "goldenLeaves", _sum: { count: 1 } }]
        : [
            { userId: "abby", kind: "leaves", _sum: { count: 9 } },
            { userId: "otto", kind: "goldenLeaves", _sum: { count: 1 } }
          ]
    );
    const past = await loadPastRanks(rows, later);
    // Otto's golden leaf (5) caught in harvest hour counted 10 then; Abby had 9; Sage nothing yet.
    expect(Object.fromEntries(past)).toEqual({ otto: 1, abby: 2 });
    const cutoff = mocks.catchGroupBy.mock.calls[0][0].where.caughtAt.lte as Date;
    expect(cutoff.toISOString()).toBe(new Date("2026-11-04T12:30:00-08:00").toISOString());
  });

  it("does nothing for an empty board", async () => {
    expect((await loadPastRanks([], NOW)).size).toBe(0);
    expect(mocks.catchGroupBy).not.toHaveBeenCalled();
  });
});
