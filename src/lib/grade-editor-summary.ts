import type { GradeScoreState } from "@prisma/client";
import { CHECK_IN_STAGES, POINTS_PER_CHECK_IN, type CheckInScores } from "@/src/lib/package-stages";

export type PointsSummary = { earned: number; possible: number };

/**
 * One cycle's check-in total as the Grade Editor shows it: released stages only,
 * 5 possible per numeric stage. Ungraded and exempt stages count toward neither.
 */
export function cycleCheckInSummary(scores: CheckInScores): PointsSummary & { released: number } {
  return CHECK_IN_STAGES.reduce(
    (summary, stage) => {
      const score = scores[stage];
      if (score === null) return summary;
      const released = summary.released + 1;
      if (typeof score !== "number") return { ...summary, released };
      return {
        earned: summary.earned + score,
        possible: summary.possible + POINTS_PER_CHECK_IN,
        released
      };
    },
    { earned: 0, possible: 0, released: 0 }
  );
}

type PackageEntry = {
  cycleNumber: number;
  totalPoints: number | null;
  finalCutState: GradeScoreState | null;
};

function parseOverride(value: string | undefined, maxValue: number): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(maxValue, Math.round(parsed)));
}

/**
 * Package points across cycles on the Total Grade tab: official scores count,
 * and a typed temporary override fills in a cycle that has no official score.
 */
export function packageSubtotal(
  entries: readonly PackageEntry[],
  overrides: Record<number, string>,
  maxPerCycle: number
): PointsSummary {
  return entries.reduce<PointsSummary>(
    (summary, entry) => {
      const points =
        entry.totalPoints !== null
          ? entry.totalPoints
          : parseOverride(overrides[entry.cycleNumber], maxPerCycle);
      if (points === null) return summary;
      return { earned: summary.earned + points, possible: summary.possible + maxPerCycle };
    },
    { earned: 0, possible: 0 }
  );
}
