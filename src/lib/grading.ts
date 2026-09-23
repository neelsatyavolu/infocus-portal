import { MAX_CHECK_IN_POINTS_PER_CYCLE } from "@/src/lib/package-stages";

/**
 * 2026-27 grading weights.
 *   55% packages, check-ins, and livestreams
 *   35% classroom participation
 *   10% final portfolio
 */
export const GRADE_WEIGHTS = {
  packages: 0.55,
  participation: 0.35,
  portfolio: 0.1
} as const;

export const MAX_FINAL_CUT_POINTS = 50;
/** Full livestream credit is 8 hours/semester → 40 points (5 per hour). */
export const POINTS_PER_LIVESTREAM_HOUR = 5;
export const MAX_LIVESTREAM_POINTS = 40;
/** @deprecated Prefer hour-based credit via REQUIRED_LIVESTREAM_HOURS. */
export const POINTS_PER_LIVESTREAM = 20;
/** @deprecated Prefer hour-based credit (8 hours / semester). */
export const REQUIRED_LIVESTREAMS_PER_SEMESTER = 3;
export const MAX_PORTFOLIO_POINTS = 100;

/**
 * Participation schedule (2026–27):
 * Monday PA short period = 10; Tue/Thu class = 20 each; Wed/Fri shows none.
 * Holidays score 0. Nothing before FIRST_PARTICIPATION_DATE (2026-08-18).
 * See `src/lib/school-schedule.ts`.
 */
export {
  FIRST_PARTICIPATION_DATE,
  PARTICIPATION_POINTS_MONDAY,
  PARTICIPATION_POINTS_BLOCK_DAY,
  PARTICIPATION_POINTS_PA,
  PARTICIPATION_POINTS_SHOW,
  PARTICIPATION_POINTS_PER_WEEK,
  participationPointsForDate,
  participationPointsForWeek,
  sumParticipationMax
} from "@/src/lib/school-schedule";

export type CategoryScore = {
  earned: number;
  possible: number;
};

/**
 * Anything not yet gradeable is `null` and is excluded from BOTH sides of the
 * ratio. A `0` means graded and earned nothing. Conflating the two punishes
 * students for cycles that have not happened or work producers have not marked.
 */
export type GradeInput = {
  /** Per cycle. Null until that cycle's final cut has been graded. */
  finalCutPoints: Array<number | null>;
  /** Per cycle. Null until at least one check-in deadline has passed. */
  checkInPoints: Array<number | null>;
  /**
   * Per cycle. 5 × released check-in stages. When omitted, each graded cycle
   * still counts as 20 so existing callers stay 20-point cycles.
   */
  checkInPossible?: Array<number | null>;
  /** Null until livestream credit is tracked. */
  livestreamPoints: number | null;
  participationEarned: number;
  participationPossible: number;
  /** Null until the final portfolio has actually been graded. */
  portfolioPoints: number | null;
};

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function graded(values: Array<number | null>) {
  return values.filter((value): value is number => value !== null);
}

function ratio(score: CategoryScore) {
  if (score.possible <= 0) {
    return 0;
  }

  return score.earned / score.possible;
}

export function packageCategoryScore(input: GradeInput): CategoryScore {
  // Each component contributes to the denominator only once it is gradeable, so
  // an ungraded cycle or untracked livestream credit is not a silent zero.
  const finalCuts = graded(input.finalCutPoints);
  const checkIns = graded(input.checkInPoints);
  const checkInPossible = input.checkInPoints.reduce<number>((total, earned, index) => {
    if (earned === null) {
      return total;
    }
    return total + (input.checkInPossible?.[index] ?? MAX_CHECK_IN_POINTS_PER_CYCLE);
  }, 0);

  return {
    earned: sum(finalCuts) + sum(checkIns) + (input.livestreamPoints ?? 0),
    possible:
      finalCuts.length * MAX_FINAL_CUT_POINTS +
      checkInPossible +
      (input.livestreamPoints === null ? 0 : MAX_LIVESTREAM_POINTS)
  };
}

export function participationCategoryScore(input: GradeInput): CategoryScore {
  return {
    earned: input.participationEarned,
    possible: input.participationPossible
  };
}

export function portfolioCategoryScore(input: GradeInput): CategoryScore {
  if (input.portfolioPoints === null) {
    return { earned: 0, possible: 0 };
  }

  return {
    earned: input.portfolioPoints,
    possible: MAX_PORTFOLIO_POINTS
  };
}

/**
 * Weighted percentage across the three categories. A category with nothing
 * gradeable yet (possible = 0) is dropped and the remaining weights are
 * renormalised, so an early-semester grade is not dragged down by a portfolio
 * that does not exist.
 */
export function weightedGradePercentage(input: GradeInput) {
  const categories: Array<{ weight: number; score: CategoryScore }> = [
    { weight: GRADE_WEIGHTS.packages, score: packageCategoryScore(input) },
    { weight: GRADE_WEIGHTS.participation, score: participationCategoryScore(input) },
    { weight: GRADE_WEIGHTS.portfolio, score: portfolioCategoryScore(input) }
  ];

  const active = categories.filter((category) => category.score.possible > 0);
  if (active.length === 0) {
    return 0;
  }

  const totalWeight = active.reduce((total, category) => total + category.weight, 0);
  const weighted = active.reduce(
    (total, category) => total + category.weight * ratio(category.score),
    0
  );

  return Number(((weighted / totalWeight) * 100).toFixed(1));
}

/**
 * Whether any category has something gradeable. A student with nothing marked
 * yet has no grade at all -- reporting 0% (and therefore an F) would be wrong.
 */
export function hasGradeableWork(input: GradeInput) {
  return (
    packageCategoryScore(input).possible > 0 ||
    participationCategoryScore(input).possible > 0 ||
    portfolioCategoryScore(input).possible > 0
  );
}

export function letterGrade(percentage: number) {
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B";
  if (percentage >= 70) return "C";
  if (percentage >= 60) return "D";
  return "F";
}
