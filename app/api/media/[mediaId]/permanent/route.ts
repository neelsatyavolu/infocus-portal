import { deleteBunnyVideo } from "@/src/lib/bunny";
import { handleRouteError } from "@/src/lib/api-errors";
import { syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { canManageProjectMedia } from "@/src/lib/rbac";
import { recomputeForProjectName } from "@/src/server/cycle-cut-status";
import { requireMediaAccess } from "@/src/server/memberships";

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

    const fullMedia = await prisma.mediaItem.findUnique({
      where: {
        id: mediaId
      },
      include: {
        project: {
          select: {
            name: true
          }
        },
        versions: {
          select: {
            id: true,
            bunnyVideoId: true
          }
        }
      }
    });

    if (!fullMedia) {
      throw new Error("NOT_FOUND");
    }

    if (!fullMedia.deletedAt) {
      throw new Error("BAD_REQUEST");
    }

    for (const version of fullMedia.versions) {
      await deleteBunnyVideo(version.bunnyVideoId);
    }

    await prisma.mediaItem.delete({
      where: {
        id: mediaId
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: media.project.workspaceId,
        projectId: media.project.id,
        actorId: userId,
        type: "media.permanently_deleted",
        payload: {
          mediaId,
          title: media.title
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: media.project.workspaceId,
        projectId: media.project.id,
        actorId: userId,
        action: "media.permanent_delete",
        targetType: "MediaItem",
        targetId: mediaId,
        metadata: {
          title: media.title
        }
      }
    });

    await recomputeForProjectName(fullMedia.project.name);

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
