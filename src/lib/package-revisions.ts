import { MAX_FINAL_CUT_POINTS } from "@/src/lib/grading";
import { clampFinalCutScore, type FinalCutMemberScore } from "@/src/lib/package-final-cut-scores";
import { officialFinalCutPoints } from "@/src/lib/package-review-mail";

/**
 * Revision + deadline policy for 2026-27.
 *
 * After the effective final-cut deadline (cycle date + approved extension), a
 * package that has not submitted a final cut through all three approval stages
 * is 0/50. Once that cut is in, every executive producer scores each member
 * (quality /25 + effort /25); the app averages each member's totals to the
 * nearest tenth. Associate producers do not grade.
 *
 * A second revision is offered when any member's first graded final cut scores
 * below 75%. That member's revision is capped at 75%. Late 20%/30% is a separate
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

/** The group may re-upload when any member scored below 75% and has not revised yet. */
export function groupAllowsSecondFinalCut(
  grades: Array<{ awardedFinalCutPoints: number | null; revisionCount: number }>
) {
  return grades.some((grade) => isEligibleForSecondRevision(grade.awardedFinalCutPoints, grade.revisionCount));
}

/**
 * Revision count once a member's executive scores are complete. Editing scores on
 * the same cut keeps the count; completing scores on a new cut is the next revision.
 */
export function nextMemberRevisionCount(input: {
  alreadyGraded: boolean;
  revisionCount: number;
  scoresWereComplete: boolean;
}) {
  if (!input.alreadyGraded) return 1;
  if (input.scoresWereComplete) return input.revisionCount;
  return Math.max(input.revisionCount, 1) + 1;
}

/**
 * Revisions are per member. When the group re-uploads for a member below 75%,
 * a member who already scored 75% or more keeps their grade and is not re-scored.
 */
export function memberGradeLocked(input: {
  awardedPoints: number | null;
  revisionCount: number;
  scoresComplete: boolean;
}) {
  return (
    input.awardedPoints !== null &&
    !input.scoresComplete &&
    !isEligibleForSecondRevision(input.awardedPoints, input.revisionCount)
  );
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

/**
 * Members executives still score. Drops members locked during a revision: already
 * graded at 75%+ with no scores on the current cut, so nobody can score them.
 */
export function membersAwaitingFinalCutScores(
  memberIds: string[],
  scores: FinalCutMemberScore[],
  grades: Array<{ userId: string; awardedFinalCutPoints: number | null; revisionCount: number }>
) {
  const scoredMembers = new Set(scores.map((score) => score.memberUserId));
  const lockedMembers = new Set(
    grades
      .filter(
        (grade) =>
          grade.awardedFinalCutPoints !== null &&
          !scoredMembers.has(grade.userId) &&
          !isEligibleForSecondRevision(grade.awardedFinalCutPoints, grade.revisionCount)
      )
      .map((grade) => grade.userId)
  );
  return memberIds.filter((id) => !lockedMembers.has(id));
}
