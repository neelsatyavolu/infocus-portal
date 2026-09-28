import type { PackageApprovalStage } from "@prisma/client";

/** Reviewers are reminded after this long, and again every interval after that. */
export const REVIEW_REMINDER_INTERVAL_MS = 12 * 60 * 60 * 1000;

export type ReviewStage = "ASSOCIATE_REVIEW" | "ADVISER_REVIEW" | "EXECUTIVE_REVIEW";

const PREVIOUS_STAGE: Record<ReviewStage, PackageApprovalStage | null> = {
  ASSOCIATE_REVIEW: null,
  ADVISER_REVIEW: "ASSOCIATE_REVIEW",
  EXECUTIVE_REVIEW: "ADVISER_REVIEW"
};

export function isReviewStage(stage: PackageApprovalStage): stage is ReviewStage {
  return stage in PREVIOUS_STAGE;
}

type Signoff = { userId: string; stage: PackageApprovalStage; approved: boolean; createdAt: Date };

/**
 * When the package started waiting on this stage: the latest cut upload or the
 * previous stage's approval, whichever came last.
 */
export function reviewWaitingSince(input: { stage: ReviewStage; versionCreatedAt: Date; signoffs: Signoff[] }) {
  const previous = PREVIOUS_STAGE[input.stage];
  return input.signoffs.reduce(
    (latest, signoff) =>
      signoff.approved && signoff.stage === previous && signoff.createdAt > latest ? signoff.createdAt : latest,
    input.versionCreatedAt
  );
}

/** Which 12-hour reminder is due (1, 2, 3, …), or null before the first 12 hours pass. */
export function reviewReminderNumber(waitingSince: Date, now: Date) {
  const count = Math.floor((now.getTime() - waitingSince.getTime()) / REVIEW_REMINDER_INTERVAL_MS);
  return count >= 1 ? count : null;
}

/** Stage 3 needs several executives, so only those who haven't approved yet are reminded. */
export function executivesWhoApproved(signoffs: Signoff[], waitingSince: Date) {
  return new Set(
    signoffs
      .filter((signoff) => signoff.stage === "EXECUTIVE_REVIEW" && signoff.approved && signoff.createdAt >= waitingSince)
      .map((signoff) => signoff.userId)
  );
}

/** Dedupe key stored in PackageReviewNotice.mediaVersionId: one reminder per 12-hour window. */
export function reviewReminderKey(versionId: string, waitingSince: Date, reminderNumber: number) {
  return `reminder:${versionId}:${waitingSince.getTime()}:${reminderNumber}`;
}
