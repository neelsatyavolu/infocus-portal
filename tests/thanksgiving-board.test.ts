import { describe, expect, it } from "vitest";
import {
  clampHarvest,
  EMPTY_HARVEST,
  harvestTotal,
  MAX_BATCH,
  rankBoard,
  type BoardEntry
} from "@/src/lib/thanksgiving-board";

function entry(userId: string, counts: Partial<BoardEntry>): BoardEntry {
  return { ...EMPTY_HARVEST, userId, name: userId, ...counts };
}

describe("clampHarvest", () => {
  it("keeps whole, positive counts and caps each kind", () => {
    expect(clampHarvest({ leaves: 3.7, pies: -2, wishbones: "4", giantTurkeys: Number.NaN, pardons: 10_000 })).toEqual({
      leaves: 3,
      pies: 0,
      wishbones: 4,
      giantTurkeys: 0,
      pardons: MAX_BATCH
    });
  });

  it("ignores unknown fields and missing input", () => {
    expect(clampHarvest({ leaves: 1, gold: 99 } as never)).toEqual({ ...EMPTY_HARVEST, leaves: 1 });
    expect(clampHarvest(null)).toEqual(EMPTY_HARVEST);
  });

  it("takes a higher cap for the one-time carry-over", () => {
    expect(clampHarvest({ leaves: 1_500 }, 2_000).leaves).toBe(1_500);
  });
});

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
    expect(harvestTotal(EMPTY_HARVEST)).toBe(0);
  });
});
