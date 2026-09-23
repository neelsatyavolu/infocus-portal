import { associateReviewClosed } from "@/src/lib/package-approval";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { producerMayActOnPackage } from "@/src/lib/package-producer-assignment";
import { parseReviewNotice, reviewNoticeHref } from "@/src/lib/package-review-notice";
import { notifyPackageMembersOfComment } from "@/src/server/package-review-notify";
import {
  countUnreadComments,
  emptyStageCommentUnread,
  isFeedbackStage,
  parseApprovalComment,
  unreadCountForStage,
  wrapApprovalComment,
  type StageCommentUnread
} from "@/src/lib/package-stage-comments";
import type { GroupStageSlug } from "@/src/lib/package-stages";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";

export type StageCommentView = {
  id: string;
  rowId: string;
  stage: GroupStageSlug;
  body: string;
  createdAt: string;
  reviewHref: string | null;
  author: { userId: string; name: string | null; email: string | null };
};

export async function requireStageCommentAccess(
  rowId: string,
  userId: string,
  role: Parameters<typeof hasPlatformRole>[0],
  options: { write?: boolean; stage?: GroupStageSlug } = {}
) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: rowId },
    select: {
      id: true,
      assignedProducerUserId: true,
      members: { select: { userId: true } },
      approval: { select: { stage: true } }
    }
  });
  if (!row) {
    throw new Error("NOT_FOUND");
  }

  const isProducer = producerMayActOnPackage(role, userId, row);
  const isMember = row.members.some((member) => member.userId === userId);
  if (options.write) {
    if (!isProducer) {
      throw new Error("FORBIDDEN");
    }
    if (options.stage === "initial-cut" && associateReviewClosed(role, row.approval?.stage)) {
      throw new Error("FORBIDDEN");
    }
    return { row, isProducer, isMember };
  }
  if (!hasPlatformRole(role, "ASSOCIATE_PRODUCER") && !isMember) {
    throw new Error("FORBIDDEN");
  }
  return { row, isProducer, isMember };
}

export function serializeStageComment(comment: {
  id: string;
  rowId: string;
  stage: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string | null; nickname?: string | null; email: string | null };
}): StageCommentView {
  const notice = parseReviewNotice(parseApprovalComment(comment.body).text);
  return {
    id: comment.id,
    rowId: comment.rowId,
    stage: comment.stage as GroupStageSlug,
    body: notice.text,
    createdAt: comment.createdAt.toISOString(),
    reviewHref: reviewNoticeHref({
      body: comment.body,
      authorId: comment.author.id,
      createdAt: comment.createdAt
    }),
    author: {
      userId: comment.author.id,
      name: userDisplayName(comment.author) || comment.author.name,
      email: comment.author.email
    }
  };
}

export async function listStageComments(rowId: string, stage: GroupStageSlug) {
  const comments = await prisma.packageStageComment.findMany({
    where: { rowId, stage },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, name: true, nickname: true, email: true } } }
  });
  const serialized = comments.map(serializeStageComment);
  if (stage !== "initial-cut") {
    return serialized;
  }

  const row = await prisma.packageProgressRow.findUnique({
    where: { id: rowId },
    select: {
      initialCutMediaItem: {
        select: {
          id: true,
          projectId: true,
          currentVersionId: true,
          versions: {
            select: {
              approvalEvents: {
                where: { note: "Review submitted" },
                select: { mediaVersionId: true, changedById: true, createdAt: true }
              }
            }
          }
        }
      }
    }
  });
  const media = row?.initialCutMediaItem;
  if (!media) {
    return serialized;
  }

  const events = media.versions.flatMap((version) => version.approvalEvents);
  return serialized.map((comment, index) => {
    if (comment.reviewHref) return comment;
    return {
      ...comment,
      reviewHref: reviewNoticeHref({
        body: comments[index]?.body ?? comment.body,
        authorId: comment.author.userId,
        createdAt: comment.createdAt,
        fallback: {
          projectId: media.projectId,
          mediaId: media.id,
          versionId: media.currentVersionId
        },
        events
      })
    };
  });
}

export async function createStageComment(input: {
  rowId: string;
  stage: GroupStageSlug;
  authorId: string;
  body: string;
  fromApproval?: boolean;
}) {
  const body = input.fromApproval ? wrapApprovalComment(input.body) : input.body;
  const comment = await prisma.packageStageComment.create({
    data: {
      rowId: input.rowId,
      stage: input.stage,
      authorId: input.authorId,
      body
    },
    include: { author: { select: { id: true, name: true, nickname: true, email: true } } }
  });
  if (input.stage === "a-roll" && !input.fromApproval) {
    await prisma.packageProgressRow.updateMany({
      where: { id: input.rowId, aRollBRoll: true },
      data: { aRollBRoll: false }
    });
  }
  const serialized = serializeStageComment(comment);
  if (!input.fromApproval) {
    void notifyPackageMembersOfComment({
      progressRowId: input.rowId,
      stage: input.stage,
      authorId: input.authorId,
      authorName: serialized.author.name?.trim() || serialized.author.email || "A producer",
      body
    }).catch((error) => console.error("notifyPackageMembersOfComment failed", error));
  }
  return serialized;
}

export async function createApprovalStageComment(input: {
  rowId: string;
  stage: GroupStageSlug;
  authorId: string;
  body: string;
}) {
  const text = input.body.trim();
  if (!text) return null;
  return createStageComment({ ...input, body: text, fromApproval: true });
}

export async function markStageCommentsRead(input: {
  userId: string;
  rowId: string;
  stage: GroupStageSlug;
}) {
  await prisma.packageStageCommentRead.upsert({
    where: {
      userId_rowId_stage: {
        userId: input.userId,
        rowId: input.rowId,
        stage: input.stage
      }
    },
    create: {
      userId: input.userId,
      rowId: input.rowId,
      stage: input.stage,
      lastReadAt: new Date()
    },
    update: { lastReadAt: new Date() }
  });
}

export async function loadStageUnreadCount(input: { userId: string; rowId: string; stage: string }) {
  const [comments, reads] = await Promise.all([
    prisma.packageStageComment.findMany({
      where: { rowId: input.rowId, stage: input.stage },
      select: { rowId: true, stage: true, createdAt: true, authorId: true }
    }),
    prisma.packageStageCommentRead.findMany({
      where: { userId: input.userId, rowId: input.rowId, stage: input.stage },
      select: { rowId: true, stage: true, lastReadAt: true }
    })
  ]);
  return unreadCountForStage(comments, reads, input.userId, input.stage);
}

export async function loadStageCommentUnread(userId: string): Promise<StageCommentUnread> {
  const memberships = await prisma.packageProgressMember.findMany({
    where: { userId },
    select: { rowId: true }
  });
  const rowIds = memberships.map((membership) => membership.rowId);
  if (rowIds.length === 0) {
    return emptyStageCommentUnread();
  }

  const [comments, reads] = await Promise.all([
    prisma.packageStageComment.findMany({
      where: { rowId: { in: rowIds } },
      select: { rowId: true, stage: true, createdAt: true, authorId: true }
    }),
    prisma.packageStageCommentRead.findMany({
      where: { userId, rowId: { in: rowIds } },
      select: { rowId: true, stage: true, lastReadAt: true }
    })
  ]);

  return countUnreadComments(comments, reads, userId);
}

export function assertFeedbackStage(value: string): GroupStageSlug {
  if (!isFeedbackStage(value)) {
    throw new Error("BAD_REQUEST");
  }
  return value;
}
