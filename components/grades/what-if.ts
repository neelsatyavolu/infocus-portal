import { numericGradeScore, type GradeScore } from "@/src/lib/grade-score";
import {
  hasGradeableWork,
  letterGrade,
  packageCategoryScore,
  participationCategoryScore,
  portfolioCategoryScore,
  weightedGradePercentage,
  type GradeInput
} from "@/src/lib/grading";
import { MAX_CHECK_IN_POINTS_PER_CYCLE } from "@/src/lib/package-stages";
import type { GradebookWeek } from "@/src/lib/student-gradebook";
import type { EstimatedPayload } from "@/components/grades/grades-types";

/** What-if maths for the gradebook (All Grades). Nothing here is saved. */

export type AllGradesCycle = {
  cycleNumber: number;
};

/** The estimated grade as /api/grades/me and the Grade Editor send it (weights optional). */
export type AllGradesEstimated = Omit<EstimatedPayload, "weights"> & { weights?: EstimatedPayload["weights"] };

export type WhatIfOverrides = {
  finalCuts: Record<number, GradeScore>;
  checkIns: Record<number, GradeScore>;
  weeks: Record<string, GradeScore>;
  livestream?: GradeScore;
  portfolio?: GradeScore;
};

export const EMPTY_OVERRIDES: WhatIfOverrides = {
  finalCuts: {},
  checkIns: {},
  weeks: {}
};

/** True when any score has an override (even one equal to the official score). */
export function hasOverrides(overrides: WhatIfOverrides) {
  return (
    Object.keys(overrides.finalCuts).length > 0 ||
    Object.keys(overrides.checkIns).length > 0 ||
    Object.keys(overrides.weeks).length > 0 ||
    overrides.livestream !== undefined ||
    overrides.portfolio !== undefined
  );
}

/**
 * The estimated arrays re-indexed to the cycles shown (each cycle's position in `cycles`), so
 * index i lines up with visibleCycles[i].
 */
export function visibleEstimatedOf(
  estimated: AllGradesEstimated | undefined,
  cycles: AllGradesCycle[],
  visibleCycles: AllGradesCycle[]
): AllGradesEstimated | undefined {
  if (!estimated) return undefined;
  const indexes = visibleCycles.map((cycle) => cycles.findIndex((entry) => entry.cycleNumber === cycle.cycleNumber));
  return {
    ...estimated,
    packages: {
      ...estimated.packages,
      finalCutPoints: indexes.map((index) => estimated.packages.finalCutPoints[index] ?? null),
      checkInPoints: indexes.map((index) => estimated.packages.checkInPoints[index] ?? null),
      checkInPossible: indexes.map((index) => estimated.packages.checkInPossible?.[index] ?? null)
    }
  };
}

export function computeWhatIf(
  estimated: AllGradesEstimated | undefined,
  cycles: AllGradesCycle[],
  weeks: GradebookWeek[],
  overrides: WhatIfOverrides
) {
  if (!estimated) return null;

  const finalCutPoints = (estimated.packages.finalCutPoints ?? []).map((value, index) => {
    const cycleNumber = cycles[index]?.cycleNumber ?? index + 1;
    return cycleNumber in overrides.finalCuts ? numericGradeScore(overrides.finalCuts[cycleNumber]!) : value;
  });
  const checkInPoints = (estimated.packages.checkInPoints ?? []).map((value, index) => {
    const cycleNumber = cycles[index]?.cycleNumber ?? index + 1;
    return cycleNumber in overrides.checkIns ? numericGradeScore(overrides.checkIns[cycleNumber]!) : value;
  });
  const checkInPossible = (estimated.packages.checkInPossible ?? []).map((value, index) => {
    const cycleNumber = cycles[index]?.cycleNumber ?? index + 1;
    if (cycleNumber in overrides.checkIns) {
      return typeof overrides.checkIns[cycleNumber] === "number" ? (value ?? MAX_CHECK_IN_POINTS_PER_CYCLE) : null;
    }
    return value ?? null;
  });

  let participationEarned = estimated.participation.earned;
  let participationPossible = estimated.participation.possible;
  if (weeks.length > 0) {
    participationEarned = 0;
    participationPossible = 0;
    for (const week of weeks) {
      if (week.weekStart in overrides.weeks) {
        const score = numericGradeScore(overrides.weeks[week.weekStart]!);
        if (score !== null) {
          participationEarned += score;
          participationPossible += Math.max(week.fullPossible, 1);
        }
      } else if (week.graded) {
        participationEarned += week.earned;
        participationPossible += week.possible;
      }
    }
  }

  const input: GradeInput = {
    finalCutPoints,
    checkInPoints,
    checkInPossible,
    livestreamPoints:
      overrides.livestream !== undefined ? numericGradeScore(overrides.livestream) : estimated.packages.livestreamPoints,
    participationEarned,
    participationPossible,
    portfolioPoints: overrides.portfolio !== undefined ? numericGradeScore(overrides.portfolio) : estimated.portfolio.points
  };
  if (!hasGradeableWork(input)) {
    return {
      percentage: null,
      letter: null,
      packages: packageCategoryScore(input),
      participation: participationCategoryScore(input),
      portfolio: portfolioCategoryScore(input)
    };
  }
  const percentage = weightedGradePercentage(input);
  return {
    percentage,
    letter: letterGrade(percentage),
    packages: packageCategoryScore(input),
    participation: participationCategoryScore(input),
    portfolio: portfolioCategoryScore(input)
  };
}

type CategoryTotals = Record<"packages" | "participation" | "portfolio", { earned: number; possible: number }>;

/**
 * Per-category totals for the summary rail. With no what-if they are the official totals behind
 * the official letter (participation counts ended weeks only). The what-if rebuild counts every
 * graded week, so it is used only once a score has been edited.
 */
export function categoryTotalsOf(
  estimated: AllGradesEstimated | undefined,
  whatIf: ReturnType<typeof computeWhatIf>,
  whatIfActive: boolean
): CategoryTotals | null {
  const source = whatIfActive ? whatIf : estimated;
  if (!source) return null;
  return {
    packages: { earned: source.packages.earned, possible: source.packages.possible },
    participation: { earned: source.participation.earned, possible: source.participation.possible },
    portfolio: { earned: source.portfolio.earned, possible: source.portfolio.possible }
  };
}

/** A gradebook item: its official score, the max, and the shown (possibly what-if) value. */
export type GradeItem = {
  id: string;
  name: string;
  /** Small line under the name ("6 / 8 hours completed"). */
  sub?: string;
  official: number | null;
  max: number;
  value: GradeScore;
  onChange: (next: GradeScore) => void;
};

/** Earned and possible for a group; non-numeric values (ungraded, exempt, N/A) are left out. */
export function groupScore(rows: GradeItem[]) {
  return {
    earned: rows.reduce((total, row) => total + (numericGradeScore(row.value) ?? 0), 0),
    possible: rows.reduce((total, row) => total + (typeof row.value !== "number" ? 0 : row.max), 0)
  };
}

/** Points to at most one decimal ("57.5", "84"), so float sums never print long tails. */
export function formatPoints(points: number) {
  const rounded = Math.round(points * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
