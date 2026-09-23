export const MAX_CYCLE_GRADE_FEEDBACK = 2000;

export function normalizeCycleGradeFeedback(value: string) {
  return value.trim().slice(0, MAX_CYCLE_GRADE_FEEDBACK);
}

/** One shared producer note: first non-empty PackageGrade.feedback. */
export function sharedGradeFeedback(grades: Array<{ feedback: string }>) {
  return grades.find((grade) => grade.feedback.trim())?.feedback ?? "";
}

/** Published only when every member has a PackageGrade with publishedAt. */
export function cycleGradesArePublished(
  grades: Array<{ userId: string; publishedAt: Date | string | null }>,
  memberIds: string[]
) {
  if (memberIds.length === 0) return false;
  const publishedByUser = new Map(grades.map((grade) => [grade.userId, Boolean(grade.publishedAt)]));
  return memberIds.every((userId) => publishedByUser.get(userId) === true);
}
