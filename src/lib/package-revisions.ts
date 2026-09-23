import { MAX_FINAL_CUT_POINTS } from "@/src/lib/grading";
import { clampFinalCutScore } from "@/src/lib/package-final-cut-scores";
import { officialFinalCutPoints } from "@/src/lib/package-review-mail";

/**
 * Revision + deadline policy for 2026-27.
 *
 * After the effective final-cut deadline (cycle date + approved extension), a
 * package that has not submitted a final cut through all three approval stages
 * is 0/50. Once that cut is in, every executive producer enters a quality
 * score; the app averages those scores to the nearest tenth. Associate
 * producers do not grade.
 *
 * A second revision is only offered after the first graded final cut scores
 * below 75%. That revision is capped at 75%. Late 20%/30% is a separate
 * turn-in penalty applied after the quality cap.
 */
export const SECOND_REVISION_CAP_MULTIPLIER = 0.75;
export const SECOND_REVISION_CAP_POINTS = Math.floor(
  SECOND_REVISION_CAP_MULTIPLIER * MAX_FINAL_CUT_POINTS
);

export type UnresolvedFinalCutInput = {
  /** Producer true score. Null = not graded yet. */
  awardedPoints: number | null;
  /** Official points after late penalty. */
  officialPoints: number | null;
  /** Effective deadline (final cut + approved extension) has passed. */
  deadlinePassed: boolean;
  /** Package is APPROVED and a final cut file is on the row. */
  hasValidFinalCut: boolean;
};

export function unresolvedFinalCutPoints(input: UnresolvedFinalCutInput): number | null {
  if (input.awardedPoints !== null) {
    return input.officialPoints ?? input.awardedPoints;
  }

  if (input.deadlinePassed && !input.hasValidFinalCut) {
    return 0;
  }

  return null;
}

export function isSecondRevision(revisionCount: number) {
  return revisionCount >= 2;
}

export function isEligibleForSecondRevision(awardedPoints: number | null, revisionCount: number) {
  if (awardedPoints === null) {
    return false;
  }

  if (revisionCount >= 2) {
    return false;
  }

  return awardedPoints < SECOND_REVISION_CAP_POINTS;
}

export function capAwardedForRevision(awardedPoints: number, revisionCount: number) {
  const awarded = clampFinalCutScore(awardedPoints);
  if (!isSecondRevision(revisionCount)) {
    return awarded;
  }

  return Math.min(awarded, SECOND_REVISION_CAP_POINTS);
}

export function previewFinalCutOfficial(input: {
  average: number | null;
  revisionCount: number;
  penaltyMultiplier: number;
}) {
  if (input.average == null) {
    return {
      quality: null as number | null,
      afterRevisionCap: null as number | null,
      official: null as number | null,
      revisionCapped: false
    };
  }
  const quality = clampFinalCutScore(input.average);
  const afterRevisionCap = capAwardedForRevision(quality, input.revisionCount);
  return {
    quality,
    afterRevisionCap,
    official: officialFinalCutPoints(afterRevisionCap, input.penaltyMultiplier),
    revisionCapped: afterRevisionCap < quality
  };
}
