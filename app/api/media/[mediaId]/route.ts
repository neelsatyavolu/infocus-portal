import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { canManageProjectMedia } from "@/src/lib/rbac";
import { recomputeForMediaItem } from "@/src/server/cycle-cut-status";
import { requireMediaAccess } from "@/src/server/memberships";

const updateMediaSchema = z.object({
  title: z.string().trim().min(1).max(150)
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const payload = updateMediaSchema.parse(await request.json());
    const { mediaId } = await params;
    const { userId, media } = await requireMediaAccess(mediaId, [WorkspaceRole.OWNER_ADMIN, WorkspaceRole.EDITOR]);

    if (media.deletedAt) {
      throw new Error("BAD_REQUEST");
    }

    if (media.title === payload.title) {
      return ok({
        id: media.id,
        title: media.title
      });
    }

    const updated = await prisma.mediaItem.update({
      where: { id: mediaId },
      data: {
        title: payload.title
      },
      select: {
        id: true,
        title: true
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: media.project.workspaceId,
        projectId: media.project.id,
        mediaItemId: mediaId,
        actorId: userId,
        type: "media.renamed",
        payload: {
          previousTitle: media.title,
          title: updated.title
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: media.project.workspaceId,
        projectId: media.project.id,
        mediaItemId: mediaId,
        actorId: userId,
        action: "media.rename",
        targetType: "MediaItem",
        targetId: mediaId,
        metadata: {
          previousTitle: media.title,
          title: updated.title
        }
      }
    });

    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params;
    const { userId, media, membership } = await requireMediaAccess(mediaId, undefined, { allowVisibility: true });
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!canManageProjectMedia(membership.role, access.role)) {
      throw new Error("FORBIDDEN");
    }

    await prisma.mediaItem.update({
      where: { id: mediaId },
      data: {
        deletedAt: new Date(),
        deletedById: userId
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: media.project.workspaceId,
        projectId: media.project.id,
        mediaItemId: mediaId,
        actorId: userId,
        type: "media.soft_deleted",
        payload: {
          title: media.title
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: media.project.workspaceId,
        projectId: media.project.id,
        mediaItemId: mediaId,
        actorId: userId,
        action: "media.soft_delete",
        targetType: "MediaItem",
        targetId: mediaId,
        metadata: {
          title: media.title
        }
      }
    });

    await recomputeForMediaItem(mediaId);

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
