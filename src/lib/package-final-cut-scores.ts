import { type PlatformRole } from "@prisma/client";
import { isExecutiveProducer } from "@/src/lib/platform-admin";
import { MAX_FINAL_CUT_POINTS } from "@/src/lib/grading";

/** Final-cut quality scores are stored to one decimal place. */
export function roundToTenth(value: number) {
  return Math.round(value * 10) / 10;
}

/** Each executive scores every member: quality /25 + effort /25 = /50. */
export const MAX_FINAL_CUT_QUALITY_POINTS = MAX_FINAL_CUT_POINTS / 2;
export const MAX_FINAL_CUT_EFFORT_POINTS = MAX_FINAL_CUT_POINTS / 2;

export function clampFinalCutScore(value: number) {
  return Math.max(0, Math.min(MAX_FINAL_CUT_POINTS, roundToTenth(value)));
}

/** Clamps a quality or effort part to 0–25 (both parts share the same max). */
export function clampFinalCutPart(value: number) {
  return Math.max(0, Math.min(MAX_FINAL_CUT_QUALITY_POINTS, roundToTenth(value)));
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

export type FinalCutMemberScore = {
  graderUserId: string;
  /** Null = legacy whole-group score. */
  memberUserId: string | null;
  points: number;
  qualityPoints: number | null;
  effortPoints: number | null;
};

/** One member's status: every required executive must score them before their average counts. */
export function memberGradeStatus(input: {
  requiredGraderIds: string[];
  scores: FinalCutMemberScore[];
  memberUserId: string;
}) {
  const scores = input.scores.filter((score) => score.memberUserId === input.memberUserId);
  const status = executiveGradeStatus({ requiredGraderIds: input.requiredGraderIds, scores });
  const partAverage = (pick: (score: FinalCutMemberScore) => number | null) =>
    status.complete ? averageExecutiveScores(scores.map((score) => pick(score) ?? 0)) : null;

  return {
    ...status,
    qualityAverage: partAverage((score) => score.qualityPoints),
    effortAverage: partAverage((score) => score.effortPoints)
  };
}

/** Whether the legacy whole-group scores (one /50 per executive) were complete. */
export function legacyGroupGradeComplete(input: {
  requiredGraderIds: string[];
  scores: FinalCutMemberScore[];
}) {
  return executiveGradeStatus({
    requiredGraderIds: input.requiredGraderIds,
    scores: input.scores.filter((score) => score.memberUserId === null)
  }).complete;
}

/** Executives who have scored every member (or entered a legacy whole-group score). */
export function gradersDoneWithGroup(scores: FinalCutMemberScore[], memberIds: string[]) {
  const byGrader = new Map<string, Set<string | null>>();
  for (const score of scores) {
    byGrader.set(score.graderUserId, new Set([...(byGrader.get(score.graderUserId) ?? []), score.memberUserId]));
  }
  return [...byGrader.entries()]
    .filter(([, members]) => members.has(null) || (memberIds.length > 0 && memberIds.every((id) => members.has(id))))
    .map(([graderUserId]) => graderUserId);
}
