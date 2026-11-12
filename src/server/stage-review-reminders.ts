import { PlatformRole } from "@prisma/client";
import { sendBrandedEmails } from "@/src/lib/email";
import { mainAppOrigin } from "@/src/lib/hosts";
import { gradersDoneWithGroup, type FinalCutMemberScore } from "@/src/lib/package-final-cut-scores";
import { REVIEW_REMINDER_INTERVAL_MS, reviewReminderNumber } from "@/src/lib/package-review-reminders";
import { APPROVAL_COMMENT_PREFIX } from "@/src/lib/package-stage-comments";
import { producerStagePath, reviewReminderMail } from "@/src/lib/package-stage-events";
import { participationApprovalMailRecipients } from "@/src/lib/participation-grade-requests";
import { normalizeEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { resolveActiveCycleNumber } from "@/src/server/package-cycle-stage";
import { loadRequiredFinalCutGraders } from "@/src/server/package-progress-data";
import {
  claimReviewNotice,
  deliverProducerMail,
  loadProgressRow,
  memberNames,
  resolveProducerRecipients
} from "@/src/server/package-review-notify";

const HOUR_MS = 60 * 60 * 1000;

function hoursFor(reminderNumber: number) {
  return (reminderNumber * REVIEW_REMINDER_INTERVAL_MS) / HOUR_MS;
}

/**
 * A-roll/B-roll waits on its producer from the latest upload, unless producer feedback came
 * after that upload (then it needs changes and the students owe the next move). Null when
 * there's nothing to review.
 */
export function aRollWaitingSince(input: {
  approved: boolean;
  uploads: Date[];
  feedback: Date[];
}) {
  if (input.approved || input.uploads.length === 0) return null;
  const latestUpload = new Date(Math.max(...input.uploads.map((date) => date.getTime())));
  const latestFeedback = input.feedback.length > 0 ? Math.max(...input.feedback.map((date) => date.getTime())) : null;
  return latestFeedback !== null && latestFeedback >= latestUpload.getTime() ? null : latestUpload;
}

/** Final Cut graders who haven't scored every member yet (members of the group never grade it). */
export function finalCutGradersOwing(input: {
  graderIds: string[];
  memberIds: string[];
  scores: FinalCutMemberScore[];
}) {
  const done = new Set(gradersDoneWithGroup(input.scores, input.memberIds));
  const members = new Set(input.memberIds);
  return input.graderIds.filter((id) => !done.has(id) && !members.has(id));
}

/**
 * Reminder number due on this hourly run: only the run in the first hour of each 12-hour
 * window sends, for reminders with no receipt table to dedupe against.
 */
export function reminderDueThisHour(waitingSince: Date, now: Date) {
  const number = reviewReminderNumber(waitingSince, now);
  if (!number) return null;
  const intoWindow = now.getTime() - waitingSince.getTime() - number * REVIEW_REMINDER_INTERVAL_MS;
  return intoWindow < HOUR_MS ? number : null;
}

/** Dedupe keys stored in PackageReviewNotice.mediaVersionId. */
export function aRollReminderKey(mediaLinkId: string, reminderNumber: number) {
  return `a-roll-reminder:${mediaLinkId}:${reminderNumber}`;
}

export function finalCutReminderKey(versionId: string, reminderNumber: number) {
  return `final-cut-reminder:${versionId}:${reminderNumber}`;
}

/**
 * Hourly: A-roll/B-roll footage waiting on producer approval for 12 hours (it scores 0/5 until
 * approved) reminds the assigned producer, then every 12 hours until they approve or ask for changes.
 */
export async function runARollReviewReminders(now = new Date()) {
  const activeCycle = await resolveActiveCycleNumber(null);
  const rows = await prisma.packageProgressRow.findMany({
    where: { cycleNumber: { gte: activeCycle }, aRollBRoll: false, stageMedia: { some: { stage: "a-roll" } } },
    select: {
      id: true,
      stageMedia: { where: { stage: "a-roll" }, select: { id: true, createdAt: true } },
      stageComments: {
        where: { stage: "a-roll", NOT: { body: { startsWith: APPROVAL_COMMENT_PREFIX } } },
        select: { createdAt: true }
      }
    }
  });

  let sent = 0;
  for (const row of rows) {
    const waitingSince = aRollWaitingSince({
      approved: false,
      uploads: row.stageMedia.map((link) => link.createdAt),
      feedback: row.stageComments.map((comment) => comment.createdAt)
    });
    if (!waitingSince) continue;
    const reminderNumber = reviewReminderNumber(waitingSince, now);
    if (!reminderNumber) continue;
    const latest = row.stageMedia.find((link) => link.createdAt.getTime() === waitingSince.getTime());
    if (!latest) continue;

    try {
      const claimed = await claimReviewNotice({
        progressRowId: row.id,
        stage: "ASSOCIATE_REVIEW",
        mediaVersionId: aRollReminderKey(latest.id, reminderNumber)
      });
      if (!claimed) continue;
      const loaded = await loadProgressRow(row.id);
      if (!loaded) continue;
      const { emails, userIds } = await resolveProducerRecipients("ap", loaded);
      if (emails.length === 0 && userIds.length === 0) continue;
      await deliverProducerMail({
        emails,
        userIds,
        path: producerStagePath(row.id, "a-roll"),
        content: reviewReminderMail({
          cycleNumber: loaded.cycleNumber,
          topic: loaded.groupTopic,
          members: memberNames(loaded.members),
          stageLabel: "A-roll/B-roll approval",
          hoursWaiting: hoursFor(reminderNumber)
        })
      });
      sent += 1;
    } catch (error) {
      console.error("a-roll review reminder failed", row.id, error);
    }
  }
  return { checked: rows.length, sent };
}

/**
 * Hourly: a Final Cut not scored by every grader 12 hours after its upload reminds the graders
 * who still owe scores, then every 12 hours. Covers the active cycle and the one before it.
 */
export async function runFinalCutGradingReminders(now = new Date()) {
  const activeCycle = await resolveActiveCycleNumber(null);
  const [rows, graders] = await Promise.all([
    prisma.packageProgressRow.findMany({
      where: { cycleNumber: { gte: activeCycle - 1 }, finalCutMediaItem: { currentVersionId: { not: null } } },
      select: {
        id: true,
        cycleNumber: true,
        groupTopic: true,
        finalCutMediaItem: { select: { currentVersion: { select: { id: true, createdAt: true } } } },
        finalCutScores: {
          select: { graderUserId: true, memberUserId: true, points: true, qualityPoints: true, effortPoints: true }
        },
        members: { select: { userId: true, user: { select: { name: true, nickname: true, email: true } } } }
      }
    }),
    loadRequiredFinalCutGraders()
  ]);
  const graderById = new Map(graders.map((grader) => [grader.userId, grader]));

  let sent = 0;
  for (const row of rows) {
    const version = row.finalCutMediaItem?.currentVersion;
    if (!version) continue;
    const reminderNumber = reviewReminderNumber(version.createdAt, now);
    if (!reminderNumber) continue;
    const owing = finalCutGradersOwing({
      graderIds: [...graderById.keys()],
      memberIds: row.members.map((member) => member.userId),
      scores: row.finalCutScores
    });
    if (owing.length === 0) continue;

    try {
      const claimed = await claimReviewNotice({
        progressRowId: row.id,
        stage: "EXECUTIVE_REVIEW",
        mediaVersionId: finalCutReminderKey(version.id, reminderNumber)
      });
      if (!claimed) continue;
      await deliverProducerMail({
        emails: owing.map((id) => graderById.get(id)?.email ?? "").filter(Boolean),
        userIds: owing,
        path: producerStagePath(row.id, "final-cut"),
        content: reviewReminderMail({
          cycleNumber: row.cycleNumber,
          topic: row.groupTopic,
          members: memberNames(row.members),
          stageLabel: "Final Cut grading",
          hoursWaiting: hoursFor(reminderNumber)
        })
      });
      sent += 1;
    } catch (error) {
      console.error("final cut grading reminder failed", row.id, error);
    }
  }
  return { checked: rows.length, sent };
}

/** Same recipients as the submission email: other executives, the adviser and super admin. */
async function participationReviewers(requesterEmail: string | null) {
  const assignments = await prisma.platformRoleAssignment.findMany({
    where: { role: { in: [PlatformRole.EXECUTIVE_PRODUCER, PlatformRole.ADVISER, PlatformRole.SUPER_ADMIN] } },
    select: { email: true }
  });
  const staff = participationApprovalMailRecipients({
    requesterEmail,
    execEmails: assignments.map((entry) => entry.email)
  });
  if (staff.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { email: { in: staff, mode: "insensitive" } },
    select: { email: true, notificationPreference: { select: { notificationEmail: true } } }
  });
  const preferred = new Map(
    users.map((user) => [
      normalizeEmail(user.email),
      normalizeEmail(user.notificationPreference?.notificationEmail) || normalizeEmail(user.email)
    ])
  );
  return [...new Set(staff.map((email) => preferred.get(email) || email))];
}

/**
 * Hourly: participation docks (scores below full marks) still pending 12 hours after they
 * were submitted remind the reviewers, then every 12 hours until one is approved or denied.
 */
export async function runParticipationDockReminders(now = new Date()) {
  const pending = await prisma.participationGradeRequest.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      createdAt: true,
      requestedBy: { select: { email: true, name: true, nickname: true } },
      _count: { select: { items: true } }
    }
  });

  let sent = 0;
  for (const request of pending) {
    const reminderNumber = reminderDueThisHour(request.createdAt, now);
    if (!reminderNumber) continue;
    try {
      const recipients = await participationReviewers(request.requestedBy.email);
      if (recipients.length === 0) continue;
      const requester =
        request.requestedBy.nickname?.trim() || request.requestedBy.name?.trim() || "A producer";
      const count = request._count.items;
      const scores = count === 1 ? "1 participation score" : `${count} participation scores`;
      const result = await sendBrandedEmails({
        recipients,
        subject: `Reminder: participation grades need approval (${count})`,
        heading: "Participation grades still need approval",
        paragraphs: [
          `${requester} submitted ${scores} ${hoursFor(reminderNumber)} hours ago. They still need approval from the adviser or another executive producer.`,
          "You'll get this reminder every 12 hours until someone approves or denies them."
        ],
        ctaLabel: "Open pending requests",
        ctaUrl: `${mainAppOrigin()}/grade-editor?view=participation`,
        idempotencyKey: `participation-dock-reminder/${request.id}/${reminderNumber}`
      });
      if (result.sent > 0) sent += 1;
    } catch (error) {
      console.error("participation dock reminder failed", request.id, error);
    }
  }
  return { checked: pending.length, sent };
}
