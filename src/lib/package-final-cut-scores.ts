import { type PlatformRole } from "@prisma/client";
import { isExecutiveProducer } from "@/src/lib/platform-admin";
import { MAX_FINAL_CUT_POINTS } from "@/src/lib/grading";

/** Final-cut quality scores are stored to one decimal place. */
export function roundToTenth(value: number) {
  return Math.round(value * 10) / 10;
}

export function clampFinalCutScore(value: number) {
  return Math.max(0, Math.min(MAX_FINAL_CUT_POINTS, roundToTenth(value)));
}

/** Mean of submitted executive scores, rounded to the nearest tenth. */
export function averageExecutiveScores(scores: number[]) {
  if (scores.length === 0) {
    return null;
  }

  const sum = scores.reduce((total, score) => total + score, 0);
  return roundToTenth(sum / scores.length);
}

export function canGradeFinalCut(role: PlatformRole | null) {
  return isExecutiveProducer(role);
}

export function executiveGradeStatus(input: {
  requiredGraderIds: string[];
  scores: Array<{ graderUserId: string; points: number }>;
}) {
  const byGrader = new Map(input.scores.map((score) => [score.graderUserId, score.points]));
  const pendingIds = input.requiredGraderIds.filter((id) => !byGrader.has(id));
  const complete =
    input.requiredGraderIds.length > 0 ? pendingIds.length === 0 : input.scores.length > 0;
  const average = complete ? averageExecutiveScores(input.scores.map((score) => score.points)) : null;

  return { complete, pendingIds, average };
}
