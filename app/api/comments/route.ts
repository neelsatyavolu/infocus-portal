import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { commentPayloadSchema, extractMentionUserIds } from "@/src/lib/comments";
import { ok } from "@/src/lib/http";
import { canComment } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { requireCommentActor } from "@/src/server/comment-access";

const createCommentRequestSchema = z.object({
  guestToken: z.string().min(8).optional()
});

export async function POST(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "comments:create"), {
      max: 60,
      windowMs: 60 * 1000
    });

    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const requestBody = await request.json();
    const payload = commentPayloadSchema.parse(requestBody);
    const meta = createCommentRequestSchema.parse(requestBody);
    const context = await requireCommentActor(payload.mediaVersionId, meta.guestToken);

    if (!canComment(context.role)) {
      throw new Error("FORBIDDEN");
    }

    if (payload.parentCommentId) {
      const parent = await prisma.reviewComment.findUnique({
        where: { id: payload.parentCommentId },
        select: { id: true, mediaVersionId: true }
      });

      if (!parent || parent.mediaVersionId !== payload.mediaVersionId) {
        throw new Error("BAD_REQUEST");
      }
    }

    const mentionUserIds = context.actorType === "member" ? extractMentionUserIds(payload.body) : [];

    const mentionMembers =
      mentionUserIds.length > 0
        ? await prisma.workspaceMember.findMany({
            where: {
              workspaceId: context.workspaceId,
              userId: { in: mentionUserIds }
            },
            select: { userId: true }
          })
        : [];

    const comment = await prisma.reviewComment.create({
      data: {
        mediaVersionId: payload.mediaVersionId,
        authorId: context.actorId,
        parentCommentId: payload.parentCommentId,
        targetType: payload.targetType,
        timeSeconds: payload.timeSeconds ?? 0,
        frameNumber: payload.frameNumber,
        xPct: payload.xPct,
        yPct: payload.yPct,
        body: payload.body,
        ...(mentionMembers.length > 0
          ? {
              mentions: {
                createMany: {
                  data: mentionMembers.map((member) => ({
                    userId: member.userId
                  })),
                  skipDuplicates: true
                }
              }
            }
          : {})
      },
      include: {
        mentions: true
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        mediaItemId: context.mediaVersion.mediaItemId,
        mediaVersionId: context.mediaVersion.id,
        commentId: comment.id,
        actorId: context.actorId,
        type: context.actorType === "guest" ? "comment.created.guest" : "comment.created",
        payload: {
          targetType: payload.targetType,
          timeSeconds: payload.timeSeconds ?? 0
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        mediaItemId: context.mediaVersion.mediaItemId,
        mediaVersionId: context.mediaVersion.id,
        commentId: comment.id,
        actorId: context.actorId,
        action: "comment.create",
        targetType: "ReviewComment",
        targetId: comment.id,
        metadata: {
          targetType: payload.targetType,
          timeSeconds: payload.timeSeconds ?? 0,
          actorType: context.actorType
        }
      }
    });

    return ok(comment, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
