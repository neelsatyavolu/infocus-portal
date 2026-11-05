import { describe, expect, it } from "vitest";
import {
  contestPhase,
  contestWinners,
  isBoardHidden,
  viewerPoints,
  EMPTY_HARVEST,
  HARVEST_CONTEST,
  isContestOpen,
  listDisqualified,
  prizeGrantDays,
  harvestTotal,
  rankBoard,
  type BoardEntry
} from "@/src/lib/thanksgiving-board";

function entry(userId: string, counts: Partial<BoardEntry>): BoardEntry {
  return { ...EMPTY_HARVEST, bonus: 0, userId, name: userId, ...counts };
}

describe("rankBoard", () => {
  it("counts every kind once and ranks the most first", () => {
    const rows = rankBoard([
      entry("Abby", { leaves: 5, pies: 1 }),
      entry("Otto", { leaves: 2, giantTurkeys: 1, pardons: 6 }),
      entry("Sage", { wishbones: 1 })
    ]);
    expect(rows.map((row) => [row.name, row.total, row.rank])).toEqual([
      ["Otto", 9, 1],
      ["Abby", 6, 2],
      ["Sage", 1, 3]
    ]);
  });

  it("breaks ties on pardons, then shares the rank", () => {
    const rows = rankBoard([
      entry("Sage", { leaves: 4 }),
      entry("Abby", { leaves: 3, pardons: 1 }),
      entry("Otto", { pies: 4 }),
      entry("Iris", { leaves: 1 })
    ]);
    expect(rows.map((row) => [row.name, row.rank])).toEqual([
      ["Abby", 1],
      ["Otto", 2],
      ["Sage", 2],
      ["Iris", 4]
    ]);
  });

  it("leaves out people who caught nothing", () => {
    expect(rankBoard([entry("Abby", {})])).toEqual([]);
    expect(harvestTotal({ ...EMPTY_HARVEST, bonus: 0 })).toBe(0);
  });

  it("counts a golden leaf five and adds harvest hour's bonus", () => {
    expect(harvestTotal({ ...EMPTY_HARVEST, leaves: 3, goldenLeaves: 2, bonus: 4 })).toBe(17);
    const rows = rankBoard([entry("Abby", { leaves: 9 }), entry("Otto", { goldenLeaves: 2 })]);
    expect(rows.map((row) => [row.name, row.total])).toEqual([
      ["Otto", 10],
      ["Abby", 9]
    ]);
  });
});

describe("listDisqualified", () => {
  it("lists flagged accounts with something caught, most first, never ranked", () => {
    const rows = listDisqualified([entry("Otto", { leaves: 3 }), entry("Abby", { leaves: 9, pies: 1 }), entry("Sage", {})]);
    expect(rows.map((row) => [row.name, row.total])).toEqual([
      ["Abby", 10],
      ["Otto", 3]
    ]);
    expect(rows[0]).not.toHaveProperty("rank");
  });
});

describe("the leaderboard contest", () => {
  it("closes at 11:59 PM Pacific on November 5", () => {
    expect(isContestOpen(new Date("2026-11-05T23:59:30-08:00"))).toBe(true);
    expect(isContestOpen(new Date("2026-11-06T00:00:00-08:00"))).toBe(false);
    expect(HARVEST_CONTEST.closesAt.toISOString()).toBe("2026-11-06T07:59:59.999Z");
  });

  it("is won by the total, and an exact tie shares the prize", () => {
    const rows = rankBoard([
      entry("Abby", { pies: 9 }),
      entry("Otto", { leaves: 4, giantTurkeys: 1, wishbones: 5 }),
      entry("Sage", { leaves: 3 })
    ]);
    expect(contestWinners(rows).map((row) => row.name)).toEqual(["Otto"]);
    const tied = rankBoard([entry("Abby", { leaves: 2 }), entry("Otto", { pies: 2 }), entry("Sage", { leaves: 1 })]);
    expect(contestWinners(tied).map((row) => row.name)).toEqual(["Abby", "Otto"]);
  });

  it("adds the prize on top of the group's longest whole-group extension", () => {
    expect(prizeGrantDays([])).toBe(2);
    expect(prizeGrantDays([1.5, 3])).toBe(5);
    expect(prizeGrantDays([29.5])).toBe(30);
  });
});

describe("contest phases", () => {
  it("goes open, dark at 11 PM, closed after 11:59 PM, revealed at 8 AM Friday", () => {
    expect(contestPhase(new Date("2026-11-05T22:59:59-08:00"))).toBe("open");
    expect(contestPhase(new Date("2026-11-05T23:00:00-08:00"))).toBe("blind");
    expect(contestPhase(HARVEST_CONTEST.closesAt)).toBe("blind");
    expect(contestPhase(new Date("2026-11-06T00:00:00-08:00"))).toBe("closed");
    expect(contestPhase(new Date("2026-11-06T08:00:00-08:00"))).toBe("revealed");
  });

  it("hides the board from the dark hour until the reveal", () => {
    expect(isBoardHidden(new Date("2026-11-05T22:00:00-08:00"))).toBe(false);
    expect(isBoardHidden(new Date("2026-11-05T23:30:00-08:00"))).toBe(true);
    expect(isBoardHidden(new Date("2026-11-06T07:59:00-08:00"))).toBe(true);
    expect(isBoardHidden(new Date("2026-11-06T08:00:00-08:00"))).toBe(false);
  });

  it("finds the viewer's own points, ranked or disqualified", () => {
    const board = { rows: [{ userId: "abby", total: 12 }], disqualified: [{ userId: "player-six", total: 7 }] };
    expect(viewerPoints(board, "abby")).toBe(12);
    expect(viewerPoints(board, "player-six")).toBe(7);
    expect(viewerPoints(board, "otto")).toBe(0);
  });
});
