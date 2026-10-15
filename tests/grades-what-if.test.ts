import { describe, expect, it } from "vitest";
import {
  cycleScoresOf,
  cycleStatusOf,
  otherTotalsOf,
  packageTotalsOf,
  pctOf,
  semesterCyclesOf
} from "@/components/grades/grade-math";
import type { EstimatedPayload, GradeTile } from "@/components/grades/grades-types";
import {
  categoryTotalsOf,
  computeWhatIf,
  EMPTY_OVERRIDES,
  formatPoints,
  groupScore,
  hasOverrides,
  visibleEstimatedOf,
  type GradeItem
} from "@/components/grades/what-if";
import { GRADE_WEIGHTS } from "@/src/lib/grading";
import type { GradebookWeek } from "@/src/lib/student-gradebook";

function estimated(overrides: Partial<EstimatedPayload["packages"]> = {}, portfolio: number | null = null): EstimatedPayload {
  return {
    percentage: null,
    letter: null,
    weights: GRADE_WEIGHTS,
    packages: {
      earned: 0,
      possible: 0,
      finalCutPoints: [45, null, null],
      checkInPoints: [20, 10, null],
      checkInPossible: [20, 10, null],
      livestreamPoints: 20,
      ...overrides
    },
    participation: { earned: 80, possible: 100 },
    portfolio: { earned: portfolio ?? 0, possible: portfolio === null ? 0 : 100, points: portfolio, max: 100 }
  };
}

const tile = (cycleNumber: number) => ({ cycleNumber }) as GradeTile;

describe("grades grade-math", () => {
  it("rounds percent to one decimal and returns null with nothing gradeable", () => {
    expect(pctOf(23, 80)).toBe(28.8);
    expect(pctOf(41, 80)).toBe(51.3);
    expect(pctOf(5, 0)).toBeNull();
  });

  it("totals graded final cuts and check-ins only (livestream is in Other)", () => {
    // 45/50 final cut + 20/20 and 10/10 check-ins; ungraded cycle 3 is left out of both sides.
    expect(packageTotalsOf(estimated())).toEqual({ earned: 75, possible: 80 });
    // A graded check-in with no possible on record counts as a full 20-point cycle.
    expect(packageTotalsOf(estimated({ checkInPossible: undefined }))).toEqual({ earned: 75, possible: 90 });
    expect(packageTotalsOf(undefined)).toEqual({ earned: 0, possible: 0 });
  });

  it("totals livestream and portfolio only once each is graded", () => {
    expect(otherTotalsOf(estimated())).toEqual({ earned: 20, possible: 40 });
    expect(otherTotalsOf(estimated({}, 90))).toEqual({ earned: 110, possible: 140 });
    expect(otherTotalsOf(estimated({ livestreamPoints: null }))).toEqual({ earned: 0, possible: 0 });
  });

  it("reads a cycle's scores by its position among all cycles", () => {
    const all = [tile(1), tile(2), tile(3)];
    expect(cycleScoresOf(all, 2, estimated())).toEqual({ finalCut: null, checkIn: 10, checkPossible: 10 });
    expect(cycleScoresOf(all, 9, estimated())).toEqual({ finalCut: null, checkIn: null, checkPossible: null });
  });

  it("keeps the semester's cycles, or all of them when the label has no term", () => {
    const all = [tile(1), tile(3), tile(4)];
    expect(semesterCyclesOf(all, "26-27 S1").map((cycle) => cycle.cycleNumber)).toEqual([1, 3]);
    expect(semesterCyclesOf(all, "26-27 S2").map((cycle) => cycle.cycleNumber)).toEqual([4]);
    expect(semesterCyclesOf(all, undefined)).toHaveLength(3);
  });

  it("labels cycle status as a tag", () => {
    expect(cycleStatusOf({ published: false, revised: false }).label).toBe("In progress");
    expect(cycleStatusOf({ published: true, revised: false }).label).toBe("Published");
    expect(cycleStatusOf({ published: true, revised: true }).tone).toBe("warning");
  });
});

describe("grades what-if", () => {
  const cycles = [{ cycleNumber: 1 }, { cycleNumber: 2 }, { cycleNumber: 3 }];

  it("matches the weighted official categories with no overrides", () => {
    const result = computeWhatIf(estimated(), cycles, [], EMPTY_OVERRIDES);
    // Packages 45 + 30 check-ins + 20 livestream over 50 + 30 + 40.
    expect(result?.packages).toEqual({ earned: 95, possible: 120 });
    expect(result?.participation).toEqual({ earned: 80, possible: 100 });
    expect(result?.portfolio).toEqual({ earned: 0, possible: 0 });
    expect(result?.letter).not.toBeNull();
  });

  it("moves the grade with an override and drops exempt work from both sides", () => {
    const base = computeWhatIf(estimated(), cycles, [], EMPTY_OVERRIDES);
    const better = computeWhatIf(estimated(), cycles, [], { ...EMPTY_OVERRIDES, finalCuts: { 2: 50 } });
    expect(better?.packages).toEqual({ earned: 145, possible: 170 });
    expect(better!.percentage!).toBeGreaterThan(base!.percentage!);

    const exempt = computeWhatIf(estimated(), cycles, [], { ...EMPTY_OVERRIDES, checkIns: { 2: "EXEMPT" } });
    expect(exempt?.packages).toEqual({ earned: 85, possible: 110 });
  });

  it("is null without an estimate, and not gradeable with no work", () => {
    expect(computeWhatIf(undefined, cycles, [], EMPTY_OVERRIDES)).toBeNull();
    const empty = estimated({ finalCutPoints: [null], checkInPoints: [null], checkInPossible: [null], livestreamPoints: null });
    const result = computeWhatIf({ ...empty, participation: { earned: 0, possible: 0 } }, [{ cycleNumber: 1 }], [], EMPTY_OVERRIDES);
    expect(result?.percentage).toBeNull();
    expect(result?.letter).toBeNull();
  });

  it("shows the official category totals in the rail until a score is edited", () => {
    // Two graded weeks; the official participation leaves out the in-progress second week.
    const week = (weekStart: string, earned: number): GradebookWeek => ({
      weekStart,
      label: weekStart,
      earned,
      possible: 50,
      fullPossible: 50,
      graded: true,
      days: []
    });
    const weeks = [week("2026-10-05", 40), week("2026-10-12", 10)];
    const official = { ...estimated(), participation: { earned: 40, possible: 50 } };

    const untouched = computeWhatIf(official, cycles, weeks, EMPTY_OVERRIDES);
    expect(untouched?.participation).toEqual({ earned: 50, possible: 100 });
    expect(categoryTotalsOf(official, untouched, false)).toEqual({
      packages: { earned: 0, possible: 0 },
      participation: { earned: 40, possible: 50 },
      portfolio: { earned: 0, possible: 0 }
    });

    const edited = computeWhatIf(official, cycles, weeks, { ...EMPTY_OVERRIDES, finalCuts: { 2: 50 } });
    expect(categoryTotalsOf(official, edited, true)).toEqual({
      packages: edited!.packages,
      participation: edited!.participation,
      portfolio: edited!.portfolio
    });
    expect(categoryTotalsOf(undefined, null, false)).toBeNull();
  });

  it("re-indexes the estimate to the visible cycles", () => {
    const visible = visibleEstimatedOf(estimated(), cycles, [{ cycleNumber: 2 }]);
    expect(visible?.packages.finalCutPoints).toEqual([null]);
    expect(visible?.packages.checkInPoints).toEqual([10]);
    expect(visibleEstimatedOf(undefined, cycles, cycles)).toBeUndefined();
  });

  it("subtotals only numeric values and spots any override", () => {
    const row = (value: GradeItem["value"], max: number): GradeItem => ({
      id: String(max),
      name: "Item",
      official: null,
      max,
      value,
      onChange: () => undefined
    });
    expect(groupScore([row(40, 50), row("EXEMPT", 20), row("UNGRADED", 20), row(null, 10)])).toEqual({ earned: 40, possible: 50 });
    expect(hasOverrides(EMPTY_OVERRIDES)).toBe(false);
    expect(hasOverrides({ ...EMPTY_OVERRIDES, portfolio: 90 })).toBe(true);
  });

  it("prints points to at most one decimal", () => {
    expect(formatPoints(84)).toBe("84");
    expect(formatPoints(57.4999)).toBe("57.5");
    expect(formatPoints(0.1 + 0.2)).toBe("0.3");
  });
});
