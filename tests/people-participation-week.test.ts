import { describe, expect, it } from "vitest";
import {
  baselineFromWeek,
  buildSavePayload,
  cellChanged,
  clampPoints,
  countChanges,
  dayColumns,
  defaultPhoneDay,
  entryKey,
  fullWeekPoints,
  offDayHasData,
  rebaseCells,
  startOfWeek,
  toDateKey,
  type GridCells,
  type WeekData
} from "@/app/(app)/grade-editor/participation/participation-week";

const MON = "2026-10-12";
const TUE = "2026-10-13";
const WED = "2026-10-14";
const THU = "2026-10-15";
const FRI = "2026-10-16";
const weekStart = new Date(2026, 9, 12);
const limits = [
  { date: MON, maxPoints: 10 },
  { date: TUE, maxPoints: 20 },
  { date: WED, maxPoints: 0 },
  { date: THU, maxPoints: 20 },
  { date: FRI, maxPoints: 0 }
];

function cells(points: Record<string, number>, notes: Record<string, string> = {}): GridCells {
  return { points, notes };
}

describe("week dates", () => {
  it("anchors weeks on Monday, including from a Sunday", () => {
    expect(toDateKey(startOfWeek(new Date(2026, 9, 15)))).toBe(MON);
    expect(toDateKey(startOfWeek(new Date(2026, 9, 18)))).toBe(MON);
  });

  it("builds five day columns with graded, off and unknown days", () => {
    const days = dayColumns(weekStart, limits.slice(0, 4), THU);
    expect(days.map((day) => day.dateKey)).toEqual([MON, TUE, WED, THU, FRI]);
    expect(days.map((day) => day.graded)).toEqual([true, true, false, true, false]);
    expect(days[2].max).toBe(0);
    expect(days[4].max).toBeNull();
    expect(days.find((day) => day.isToday)?.dateKey).toBe(THU);
  });
});

describe("defaultPhoneDay", () => {
  const days = dayColumns(weekStart, limits, WED);

  it("opens on the latest graded day so far in the current week", () => {
    expect(defaultPhoneDay(days, WED, true)).toBe(TUE);
    expect(defaultPhoneDay(days, FRI, true)).toBe(THU);
  });

  it("opens on the first graded day otherwise", () => {
    expect(defaultPhoneDay(days, WED, false)).toBe(MON);
    expect(defaultPhoneDay(days, "2026-10-11", true)).toBe(MON);
  });

  it("falls back to the first day when nothing is graded", () => {
    const off = dayColumns(weekStart, limits.map((limit) => ({ ...limit, maxPoints: 0 })), WED);
    expect(defaultPhoneDay(off, WED, true)).toBe(MON);
  });
});

describe("clampPoints", () => {
  it("rounds and clamps to the day's max, and treats junk as 0", () => {
    expect(clampPoints("17.6", 20)).toBe(18);
    expect(clampPoints("35", 20)).toBe(20);
    expect(clampPoints("-4", 20)).toBe(0);
    expect(clampPoints("5", 0)).toBe(0);
    expect(clampPoints("abc", 20)).toBe(0);
  });
});

describe("baselineFromWeek", () => {
  it("lays this week's pending docks over the live scores", () => {
    const week: WeekData = {
      students: [],
      entries: [{ userId: "abby", date: TUE, points: 20, notes: "" }],
      maxPointsByDate: limits,
      pendingCount: 1,
      pendingItems: [
        {
          requestId: "r1",
          userId: "abby",
          date: TUE,
          points: 15,
          notes: "Late",
          requestedBy: { id: "sage", name: "Sage", email: "sage@example.edu" }
        }
      ]
    };
    expect(baselineFromWeek(week)).toEqual(cells({ [entryKey("abby", TUE)]: 15 }, { [entryKey("abby", TUE)]: "Late" }));
  });
});

describe("rebaseCells", () => {
  it("keeps cells the viewer changed and takes the server for the rest", () => {
    const reference = cells({ "abby:a": 10, "otto:a": 20 }, { "abby:a": "" });
    const current = cells({ "abby:a": 5, "otto:a": 20 }, { "abby:a": "Docked" });
    const server = cells({ "abby:a": 10, "otto:a": 18 }, { "abby:a": "" });
    expect(rebaseCells(server, current, reference)).toEqual(cells({ "abby:a": 5, "otto:a": 18 }, { "abby:a": "Docked" }));
  });
});

describe("change tracking and the save payload", () => {
  const baseline = cells({ "abby:2026-10-13": 20 }, { "abby:2026-10-13": "Great" });

  it("compares comments the way Save sends them (trimmed)", () => {
    const drafts = cells({ "abby:2026-10-13": 20 }, { "abby:2026-10-13": "  Great  " });
    expect(cellChanged(drafts, baseline, "abby:2026-10-13")).toBe(false);
  });

  it("counts unsaved cells and comments that have no score", () => {
    const drafts = cells(
      { "abby:2026-10-13": 15, "otto:2026-10-13": 20 },
      { "abby:2026-10-13": "Great", "sage:2026-10-13": "Missed class" }
    );
    expect(countChanges(drafts, baseline)).toEqual({ unsaved: 2, orphanNotes: 1 });
    expect(countChanges(baseline, baseline)).toEqual({ unsaved: 0, orphanNotes: 0 });
  });

  it("sends every scored cell with its trimmed comment", () => {
    const drafts = cells({ "abby:2026-10-13": 15, "otto:2026-10-12": 10 }, { "abby:2026-10-13": " Late " });
    expect(buildSavePayload(drafts)).toEqual([
      { userId: "abby", date: TUE, points: 15, notes: "Late" },
      { userId: "otto", date: MON, points: 10, notes: "" }
    ]);
  });
});

describe("offDayHasData", () => {
  it("ignores the 0 that Full week writes, but not a real score or comment", () => {
    expect(offDayHasData(WED, ["abby"], cells({ [entryKey("abby", WED)]: 0 }))).toBe(false);
    expect(offDayHasData(WED, ["abby"], cells({ [entryKey("abby", WED)]: 5 }))).toBe(true);
    expect(offDayHasData(WED, ["abby"], cells({}, { [entryKey("abby", WED)]: "Excused" }))).toBe(true);
  });
});

describe("fullWeekPoints", () => {
  const maxByDate = new Map(limits.map((limit) => [limit.date, limit.maxPoints]));
  const maxFor = (dateKey: string) => maxByDate.get(dateKey) ?? 20;

  it("fills the graded days and leaves empty off days alone, so every change has a column", () => {
    const points = fullWeekPoints({}, "abby", weekStart, maxFor);
    expect(points).toEqual({
      [entryKey("abby", MON)]: 10,
      [entryKey("abby", TUE)]: 20,
      [entryKey("abby", THU)]: 20
    });
    expect(countChanges(cells(points), cells({}))).toEqual({ unsaved: 3, orphanNotes: 0 });
  });

  it("still zeroes a stray score on an off day, and keeps other students' cells", () => {
    const before = { [entryKey("abby", WED)]: 5, [entryKey("otto", TUE)]: 12 };
    const points = fullWeekPoints(before, "abby", weekStart, maxFor);
    expect(points[entryKey("abby", WED)]).toBe(0);
    expect(points[entryKey("abby", FRI)]).toBeUndefined();
    expect(points[entryKey("otto", TUE)]).toBe(12);
    expect(before[entryKey("abby", WED)]).toBe(5);
  });
});
