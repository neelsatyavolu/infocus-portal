import type { ReviewMailKind } from "@/src/lib/package-review-mail";
import {
  REVIEW_REMINDER_INTERVAL_MS,
  executivesWhoApproved,
  isReviewStage,
  reviewReminderKey,
  reviewReminderNumber,
  reviewWaitingSince,
  type ReviewStage
} from "@/src/lib/package-review-reminders";
import { prisma } from "@/src/lib/prisma";
import { resolveActiveCycleNumber } from "@/src/server/package-cycle-stage";
import { notifyPackageReviewReminder } from "@/src/server/package-review-notify";

const KIND_BY_STAGE: Record<ReviewStage, ReviewMailKind> = {
  ASSOCIATE_REVIEW: "ap",
  ADVISER_REVIEW: "adviser",
  EXECUTIVE_REVIEW: "execs"
};

/**
 * Hourly: any Initial Cut stage left unreviewed for 12 hours emails its reviewers
 * (associate for Stage 1, adviser for Stage 2, executives for Stage 3), then again
 * every 12 hours until someone acts. Packages waiting on the students are skipped.
 */
export async function runPackageReviewReminders(now = new Date()) {
  // Earlier cycles are finished; don't nag about packages left behind there.
  const activeCycle = await resolveActiveCycleNumber(null);
  const approvals = await prisma.packageApproval.findMany({
    where: {
      stage: { in: ["ASSOCIATE_REVIEW", "ADVISER_REVIEW", "EXECUTIVE_REVIEW"] },
      progressRow: { cycleNumber: { gte: activeCycle } }
    },
    select: {
      stage: true,
      progressRowId: true,
      signoffs: { select: { userId: true, stage: true, approved: true, createdAt: true } },
      progressRow: {
        select: {
          awaitingRevisedInitialCut: true,
          initialCutMediaItem: {
            select: { currentVersion: { select: { id: true, createdAt: true, approvalStatus: true } } }
          }
        }
      }
    }
  });

  let sent = 0;
  for (const approval of approvals) {
    const version = approval.progressRow.initialCutMediaItem?.currentVersion;
    if (!isReviewStage(approval.stage) || !version) continue;
    // Sent back for revisions, or approved in Stage 1 pending a revised upload: the students owe the next move.
    if (version.approvalStatus === "NEEDS_CHANGES" || approval.progressRow.awaitingRevisedInitialCut) continue;

    const waitingSince = reviewWaitingSince({
      stage: approval.stage,
      versionCreatedAt: version.createdAt,
      signoffs: approval.signoffs
    });
    const reminderNumber = reviewReminderNumber(waitingSince, now);
    if (!reminderNumber) continue;

    try {
      const delivered = await notifyPackageReviewReminder({
        progressRowId: approval.progressRowId,
        kind: KIND_BY_STAGE[approval.stage],
        reminderKey: reviewReminderKey(version.id, waitingSince, reminderNumber),
        hoursWaiting: (reminderNumber * REVIEW_REMINDER_INTERVAL_MS) / (60 * 60 * 1000),
        skipUserIds:
          approval.stage === "EXECUTIVE_REVIEW" ? executivesWhoApproved(approval.signoffs, waitingSince) : new Set()
      });
      if (delivered) sent += 1;
    } catch (error) {
      console.error("package review reminder failed", approval.progressRowId, error);
    }
  }
  return { checked: approvals.length, sent };
}
