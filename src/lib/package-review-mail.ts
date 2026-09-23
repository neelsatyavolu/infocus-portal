import { normalizeEmail, PACKAGE_ADVISER_EMAIL } from "@/src/lib/platform-admin";

export { PACKAGE_ADVISER_EMAIL };

export type ReviewMailKind = "ap" | "adviser" | "execs";

export function reviewMailRecipients(kind: ReviewMailKind, input: {
  assignedProducerEmail?: string | null;
  categoryProducerEmail?: string | null;
  executiveProducerEmails?: string[];
}) {
  if (kind === "adviser") {
    return PACKAGE_ADVISER_EMAIL ? [PACKAGE_ADVISER_EMAIL] : [];
  }

  if (kind === "ap") {
    const assigned = normalizeEmail(input.assignedProducerEmail);
    if (assigned) return [assigned];
    const category = normalizeEmail(input.categoryProducerEmail);
    return category ? [category] : [];
  }

  const adviser = normalizeEmail(PACKAGE_ADVISER_EMAIL);
  return [...new Set((input.executiveProducerEmails ?? []).map((email) => normalizeEmail(email)).filter(Boolean))].filter(
    (email) => email !== adviser
  );
}

export function officialFinalCutPoints(trueScore: number, penaltyMultiplier: number) {
  const awarded = Math.max(0, Math.min(50, trueScore));
  if (penaltyMultiplier <= 0) {
    return awarded;
  }
  return Math.max(0, Math.round(awarded * (1 - penaltyMultiplier)));
}
