import { PackageApprovalStage } from "@prisma/client";
import { sendPackageEventEmails } from "@/src/lib/email";
import { mainAppOrigin } from "@/src/lib/hosts";
import { parseClipComment } from "@/src/lib/package-clip-comments";
import { reviewMailRecipients, type ReviewMailKind } from "@/src/lib/package-review-mail";
import { parseReviewNotice } from "@/src/lib/package-review-notice";
import {
  aRollDailyNoticeVersionId,
  aRollNeedsChangesMail,
  aRollUploadedMail,
  approvalDecisionMail,
  brainstormReadyMail,
  checkInApprovedMail,
  commentExcerpt,
  commentMail,
  finalCutUploadedMail,
  producerStagePath,
  reviewNeededMail,
  revisionMail,
  studentStagePath,
  type PackageMailContent
} from "@/src/lib/package-stage-events";
import type { GroupStageSlug } from "@/src/lib/package-stages";
import { PLATFORM_SUPER_ADMIN_EMAIL, normalizeEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { sendPushToUserIds, type PushCategory } from "@/src/server/push-notify";

function appUrl(path: string) {
  const origin = mainAppOrigin().replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${suffix}`;
}

function memberNames(
  members: Array<{ user: { name: string | null; nickname?: string | null; email: string | null } }>
) {
  return members
    .map((member) => member.user.nickname?.trim() || member.user.name?.trim() || member.user.email || "")
    .filter(Boolean)
    .join(", ");
}

async function loadProgressRow(progressRowId: string) {
  return prisma.packageProgressRow.findUnique({
    where: { id: progressRowId },
    include: {
      assignedProducer: { select: { id: true, email: true } },
      assignedExecutiveProducer: { select: { id: true, email: true } },
      members: { include: { user: { select: { id: true, name: true, nickname: true, email: true } } } }
    }
  });
}

async function resolveProducerRecipients(kind: ReviewMailKind, row: NonNullable<Awaited<ReturnType<typeof loadProgressRow>>>) {
  const assignedProducerEmail = row.assignedProducer?.email ?? row.assignedExecutiveProducer?.email ?? null;
  const assignedProducerUserId = row.assignedProducer?.id ?? row.assignedExecutiveProducer?.id ?? null;

  let categoryProducerEmail: string | null = null;
  if (!assignedProducerEmail && row.category) {
    const assignment = await prisma.platformRoleAssignment.findFirst({
      where: { role: "ASSOCIATE_PRODUCER", category: row.category },
      select: { email: true }
    });
    categoryProducerEmail = assignment?.email ?? null;
  }

  const execAssignments =
    kind === "execs"
      ? await prisma.platformRoleAssignment.findMany({
          where: { role: { in: ["EXECUTIVE_PRODUCER", "SUPER_ADMIN"] } },
          select: { email: true }
        })
      : [];

  const emails = reviewMailRecipients(kind, {
    assignedProducerEmail,
    categoryProducerEmail,
    executiveProducerEmails: [...execAssignments.map((entry) => entry.email), PLATFORM_SUPER_ADMIN_EMAIL ?? ""]
  });

  const users =
    emails.length > 0
      ? await prisma.user.findMany({
          where: { email: { in: emails, mode: "insensitive" } },
          select: { id: true, email: true }
        })
      : [];

  const userIds = new Set(users.map((user) => user.id));
  if (kind === "ap" && assignedProducerUserId) {
    userIds.add(assignedProducerUserId);
  }

  return { emails, userIds: [...userIds] };
}

async function deliverProducerMail(input: {
  emails: string[];
  userIds: string[];
  content: PackageMailContent;
  path: string;
}) {
  const url = appUrl(input.path);
  if (input.emails.length > 0) {
    try {
      await sendPackageEventEmails({
        ...input.content,
        recipients: input.emails,
        ctaUrl: url
      });
    } catch (error) {
      console.error("package producer email failed", error);
    }
  }
  if (input.userIds.length > 0) {
    try {
      await sendPushToUserIds(
        input.userIds,
        { title: input.content.pushTitle, body: input.content.pushBody, url: input.path },
        "browser"
      );
    } catch (error) {
      console.error("package producer push failed", error);
    }
  }
}

async function claimReviewNotice(input: {
  progressRowId: string;
  stage: PackageApprovalStage;
  mediaVersionId: string;
}) {
  try {
    await prisma.packageReviewNotice.create({ data: input });
    return true;
  } catch {
    return false;
  }
}

async function deliverMemberMail(input: {
  progressRowId: string;
  excludeUserId?: string;
  category: PushCategory;
  content: PackageMailContent;
  path: string;
}) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: input.progressRowId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              notificationPreference: {
                select: {
                  notificationEmail: true
                }
              }
            }
          }
        }
      }
    }
  });
  if (!row) return;

  const emails: string[] = [];
  const pushIds: string[] = [];
  for (const member of row.members) {
    if (input.excludeUserId && member.user.id === input.excludeUserId) continue;
    pushIds.push(member.user.id);
    const email = (member.user.notificationPreference?.notificationEmail ?? member.user.email)?.trim();
    if (email) emails.push(email);
  }

  const url = appUrl(input.path);
  if (emails.length > 0) {
    try {
      await sendPackageEventEmails({
        ...input.content,
        recipients: [...new Set(emails)],
        ctaUrl: url
      });
    } catch (error) {
      console.error("package member email failed", error);
    }
  }
  if (pushIds.length > 0) {
    try {
      await sendPushToUserIds(
        pushIds,
        { title: input.content.pushTitle, body: input.content.pushBody, url: input.path },
        input.category
      );
    } catch (error) {
      console.error("package member push failed", error);
    }
  }
}

export async function notifyPackageReview(input: {
  progressRowId: string;
  kind: ReviewMailKind;
  mediaVersionId?: string | null;
}) {
  const stage: PackageApprovalStage =
    input.kind === "ap" ? "ASSOCIATE_REVIEW" : input.kind === "adviser" ? "ADVISER_REVIEW" : "EXECUTIVE_REVIEW";
  const mediaVersionId = input.mediaVersionId ?? "";
  const claimed = await claimReviewNotice({
    progressRowId: input.progressRowId,
    stage,
    mediaVersionId
  });
  if (!claimed) return;

  const row = await loadProgressRow(input.progressRowId);
  if (!row) return;

  const { emails, userIds } = await resolveProducerRecipients(input.kind, row);
  if (emails.length === 0 && userIds.length === 0) return;

  const stageLabel =
    input.kind === "ap" ? "associate producer review" : input.kind === "adviser" ? "adviser review" : "executive review";
  const navPath =
    input.kind === "ap"
      ? `/groups/${row.id}/initial-stage-1`
      : input.kind === "adviser"
        ? `/groups/${row.id}/initial-stage-2`
        : `/groups/${row.id}/initial-stage-3`;

  await deliverProducerMail({
    emails,
    userIds,
    path: navPath,
    content: reviewNeededMail({
      cycleNumber: row.cycleNumber,
      topic: row.groupTopic,
      members: memberNames(row.members),
      stageLabel
    })
  });
}

export function normalizeReviewEmail(email?: string | null) {
  return normalizeEmail(email);
}

export async function notifyPackageMembersOfRevision(input: {
  progressRowId: string;
  reviewerName: string;
}) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: input.progressRowId },
    select: { cycleNumber: true, groupTopic: true }
  });
  if (!row) return;

  await deliverMemberMail({
    progressRowId: input.progressRowId,
    category: "browser",
    path: studentStagePath("initial-cut"),
    content: revisionMail({
      cycleNumber: row.cycleNumber,
      topic: row.groupTopic,
      reviewerName: input.reviewerName
    })
  });
}

export async function notifyBrainstormMaterialsReady(progressRowId: string) {
  const row = await loadProgressRow(progressRowId);
  if (!row) return;

  const { emails, userIds } = await resolveProducerRecipients("ap", row);
  if (emails.length === 0 && userIds.length === 0) return;

  await deliverProducerMail({
    emails,
    userIds,
    path: producerStagePath(row.id, "brainstorming"),
    content: brainstormReadyMail({
      cycleNumber: row.cycleNumber,
      topic: row.groupTopic,
      members: memberNames(row.members)
    })
  });
}

export async function notifyFinalCutUploaded(progressRowId: string) {
  const row = await loadProgressRow(progressRowId);
  if (!row) return;

  const { emails, userIds } = await resolveProducerRecipients("ap", row);
  if (emails.length === 0 && userIds.length === 0) return;

  await deliverProducerMail({
    emails,
    userIds,
    path: producerStagePath(row.id, "final-cut"),
    content: finalCutUploadedMail({
      cycleNumber: row.cycleNumber,
      topic: row.groupTopic,
      members: memberNames(row.members)
    })
  });
}

export async function notifyARollUploaded(progressRowId: string) {
  const claimed = await claimReviewNotice({
    progressRowId,
    stage: "ASSOCIATE_REVIEW",
    mediaVersionId: aRollDailyNoticeVersionId()
  });
  if (!claimed) return;

  const row = await loadProgressRow(progressRowId);
  if (!row) return;

  const { emails, userIds } = await resolveProducerRecipients("ap", row);
  if (emails.length === 0 && userIds.length === 0) return;

  await deliverProducerMail({
    emails,
    userIds,
    path: producerStagePath(row.id, "a-roll"),
    content: aRollUploadedMail({
      cycleNumber: row.cycleNumber,
      topic: row.groupTopic,
      members: memberNames(row.members)
    })
  });
}

export async function notifyPackageMembersOfComment(input: {
  progressRowId: string;
  stage: GroupStageSlug;
  authorId: string;
  authorName: string;
  body: string;
}) {
  if (parseReviewNotice(input.body).projectId) {
    return;
  }

  const row = await prisma.packageProgressRow.findUnique({
    where: { id: input.progressRowId },
    select: { cycleNumber: true, groupTopic: true }
  });
  if (!row) return;

  const excerpt = commentExcerpt(parseClipComment(input.body).text);
  if (!excerpt) return;

  await deliverMemberMail({
    progressRowId: input.progressRowId,
    excludeUserId: input.authorId,
    category: "comments",
    path: studentStagePath(input.stage),
    content:
      input.stage === "a-roll"
        ? aRollNeedsChangesMail({
            cycleNumber: row.cycleNumber,
            topic: row.groupTopic,
            authorName: input.authorName,
            excerpt
          })
        : commentMail({
            cycleNumber: row.cycleNumber,
            topic: row.groupTopic,
            stage: input.stage,
            authorName: input.authorName,
            excerpt
          })
  });
}

export async function notifyCheckInApproved(input: {
  progressRowId: string;
  stage: GroupStageSlug;
  reviewerName: string;
  excludeUserId?: string;
  excerpt?: string;
}) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: input.progressRowId },
    select: { cycleNumber: true, groupTopic: true }
  });
  if (!row) return;

  await deliverMemberMail({
    progressRowId: input.progressRowId,
    excludeUserId: input.excludeUserId,
    category: "browser",
    path: studentStagePath(input.stage),
    content: checkInApprovedMail({
      cycleNumber: row.cycleNumber,
      topic: row.groupTopic,
      stage: input.stage,
      reviewerName: input.reviewerName,
      excerpt: input.excerpt
    })
  });
}

export async function notifyPackageMembersOfDecision(input: {
  progressRowId: string;
  kind: "stage-1" | "stage-2" | "approved" | "sent-back";
  reviewerName: string;
  excludeUserId?: string;
  excerpt?: string;
}) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: input.progressRowId },
    select: { cycleNumber: true, groupTopic: true }
  });
  if (!row) return;

  const path = input.kind === "approved" ? studentStagePath("final-cut") : studentStagePath("initial-cut");
  await deliverMemberMail({
    progressRowId: input.progressRowId,
    excludeUserId: input.excludeUserId,
    category: "browser",
    path,
    content: approvalDecisionMail({
      cycleNumber: row.cycleNumber,
      topic: row.groupTopic,
      kind: input.kind,
      reviewerName: input.reviewerName,
      excerpt: input.excerpt
    })
  });
}
