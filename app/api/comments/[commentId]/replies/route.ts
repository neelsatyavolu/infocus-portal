import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { replyPayloadSchema } from "@/src/lib/comments";
import { ok } from "@/src/lib/http";
import { canComment } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { requireCommentActor } from "@/src/server/comment-access";

const createReplySchema = replyPayloadSchema.extend({
  guestToken: z.string().min(8).optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const rate = limitByKey(getRequestKey(request, "comments:reply"), {
      max: 90,
      windowMs: 60 * 1000
    });

    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const { commentId } = await params;
    const payload = createReplySchema.parse(await request.json());

    const parent = await prisma.reviewComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        mediaVersionId: true,
        targetType: true,
        timeSeconds: true,
        frameNumber: true,
        xPct: true,
        yPct: true
      }
    });

    if (!parent) {
      throw new Error("NOT_FOUND");
    }

    const context = await requireCommentActor(parent.mediaVersionId, payload.guestToken);

    if (!canComment(context.role)) {
      throw new Error("FORBIDDEN");
    }

    const reply = await prisma.reviewComment.create({
      data: {
        mediaVersionId: parent.mediaVersionId,
        authorId: context.actorId,
        parentCommentId: parent.id,
        targetType: parent.targetType,
        timeSeconds: parent.timeSeconds,
        frameNumber: parent.frameNumber,
        xPct: parent.xPct,
        yPct: parent.yPct,
        body: payload.body
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        mediaItemId: context.mediaVersion.mediaItemId,
        mediaVersionId: context.mediaVersion.id,
        commentId: reply.id,
        actorId: context.actorId,
        type: context.actorType === "guest" ? "comment.reply.guest" : "comment.reply",
        payload: {
          parentCommentId: parent.id
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        mediaItemId: context.mediaVersion.mediaItemId,
        mediaVersionId: context.mediaVersion.id,
        commentId: reply.id,
        actorId: context.actorId,
        action: "comment.reply",
        targetType: "ReviewComment",
        targetId: reply.id,
        metadata: {
          parentCommentId: parent.id,
          actorType: context.actorType
        }
      }
    });

    return ok(reply, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
