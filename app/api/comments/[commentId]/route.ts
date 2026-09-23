import { z } from "zod";
import { WorkspaceRole } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { canResolveComment } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import { resolveWorkspaceAccess } from "@/src/server/workspace-access";

const updateCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000).optional(),
  resolved: z.boolean().optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await params;
    const payload = updateCommentSchema.parse(await request.json());
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);

    const comment = await prisma.reviewComment.findUnique({
      where: { id: commentId },
      include: {
        mediaVersion: {
          include: {
            mediaItem: {
              include: {
                project: true
              }
            }
          }
        }
      }
    });

    if (!comment) {
      throw new Error("NOT_FOUND");
    }

    const access = await resolveWorkspaceAccess({
      workspaceId: comment.mediaVersion.mediaItem.project.workspaceId,
      userId,
      email: user?.email,
      allowVisibility: true
    });
    const membership = access.membership;

    const updates: {
      body?: string;
      resolvedAt?: Date | null;
      resolvedById?: string | null;
    } = {};

    if (payload.body !== undefined) {
      if (comment.authorId !== userId) {
        throw new Error("FORBIDDEN");
      }

      updates.body = payload.body;
    }

    if (payload.resolved !== undefined) {
      if (!canResolveComment(membership.role, comment.authorId === userId)) {
        throw new Error("FORBIDDEN");
      }

      updates.resolvedAt = payload.resolved ? new Date() : null;
      updates.resolvedById = payload.resolved ? userId : null;
    }

    const updated = await prisma.reviewComment.update({
      where: { id: commentId },
      data: updates
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: comment.mediaVersion.mediaItem.project.workspaceId,
        projectId: comment.mediaVersion.mediaItem.project.id,
        mediaItemId: comment.mediaVersion.mediaItemId,
        mediaVersionId: comment.mediaVersion.id,
        commentId: comment.id,
        actorId: userId,
        type: payload.resolved !== undefined ? "comment.resolution.updated" : "comment.updated",
        payload: payload
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: comment.mediaVersion.mediaItem.project.workspaceId,
        projectId: comment.mediaVersion.mediaItem.project.id,
        mediaItemId: comment.mediaVersion.mediaItemId,
        mediaVersionId: comment.mediaVersion.id,
        commentId: comment.id,
        actorId: userId,
        action: "comment.update",
        targetType: "ReviewComment",
        targetId: comment.id,
        metadata: payload
      }
    });

    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);

    const comment = await prisma.reviewComment.findUnique({
      where: { id: commentId },
      include: {
        mediaVersion: {
          include: {
            mediaItem: {
              include: {
                project: true
              }
            }
          }
        }
      }
    });

    if (!comment) {
      throw new Error("NOT_FOUND");
    }

    const access = await resolveWorkspaceAccess({
      workspaceId: comment.mediaVersion.mediaItem.project.workspaceId,
      userId,
      email: user?.email,
      allowVisibility: true
    });
    const membership = access.membership;

    const canDelete =
      comment.authorId === userId ||
      membership.role === WorkspaceRole.OWNER_ADMIN ||
      membership.role === WorkspaceRole.EDITOR;

    if (!canDelete) {
      throw new Error("FORBIDDEN");
    }

    await prisma.reviewComment.delete({
      where: { id: commentId }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: comment.mediaVersion.mediaItem.project.workspaceId,
        projectId: comment.mediaVersion.mediaItem.project.id,
        mediaItemId: comment.mediaVersion.mediaItemId,
        mediaVersionId: comment.mediaVersion.id,
        commentId: comment.id,
        actorId: userId,
        type: "comment.deleted",
        payload: {
          parentCommentId: comment.parentCommentId
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: comment.mediaVersion.mediaItem.project.workspaceId,
        projectId: comment.mediaVersion.mediaItem.project.id,
        mediaItemId: comment.mediaVersion.mediaItemId,
        mediaVersionId: comment.mediaVersion.id,
        commentId: comment.id,
        actorId: userId,
        action: "comment.delete",
        targetType: "ReviewComment",
        targetId: comment.id,
        metadata: {
          parentCommentId: comment.parentCommentId
        }
      }
    });

    return ok({ id: commentId });
  } catch (error) {
    return handleRouteError(error);
  }
}
