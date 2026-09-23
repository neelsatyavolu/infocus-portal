export const ASSOCIATE_SCORE_WEIGHTS = {
  quality: 25, progress: 25, responsiveness: 25, reviewCoverage: 10, feedbackCoverage: 5, groupFeedback: 10
} as const;

export function combineAssociateScore(values: Partial<Record<keyof typeof ASSOCIATE_SCORE_WEIGHTS, number | null>>) {
  let points = 0;
  let availableWeight = 0;
  for (const key of Object.keys(ASSOCIATE_SCORE_WEIGHTS) as Array<keyof typeof ASSOCIATE_SCORE_WEIGHTS>) {
    const value = values[key];
    if (value == null || !Number.isFinite(value)) continue;
    const weight = ASSOCIATE_SCORE_WEIGHTS[key];
    points += Math.max(0, Math.min(100, value)) * weight;
    availableWeight += weight;
  }
  return { score: availableWeight ? Math.round(points / availableWeight) : null, availableWeight, provisional: availableWeight < 100 };
}

export type ProgressMilestone = { label: string; dueAt: string | null; complete: boolean };
export function groupProgress(milestones: ProgressMilestone[], now = new Date()) {
  const eligible = milestones.filter((m) => m.dueAt && Date.parse(m.dueAt) <= now.getTime());
  const completed = eligible.filter((m) => m.complete).length;
  return { score: eligible.length ? Math.round(completed / eligible.length * 100) : null, due: eligible.length, completed, milestones };
}
export type GroupFeedbackRatings = { helpfulness: number; communication: number; support: number };
export function groupFeedbackScore(reviews: GroupFeedbackRatings[]) {
  if (!reviews.length) return null;
  return Math.round(reviews.reduce((sum, r) => sum + (r.helpfulness + r.communication + r.support - 3) / 12 * 100, 0) / reviews.length);
}
