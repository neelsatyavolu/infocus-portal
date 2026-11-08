import { handleRouteError } from "@/src/lib/api-errors";
import { syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { canManageProjectMedia } from "@/src/lib/rbac";
import { recomputeForMediaItem } from "@/src/server/cycle-cut-status";
import { requireMediaAccess } from "@/src/server/memberships";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params;
    const { userId, media, membership } = await requireMediaAccess(mediaId);
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!canManageProjectMedia(membership.role, access.role)) {
      throw new Error("FORBIDDEN");
    }

    const restored = await prisma.mediaItem.update({
      where: {
        id: mediaId
      },
      data: {
        deletedAt: null,
        deletedById: null
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: media.project.workspaceId,
        projectId: media.project.id,
        mediaItemId: mediaId,
        actorId: userId,
        type: "media.restored",
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
        action: "media.restore",
        targetType: "MediaItem",
        targetId: mediaId,
        metadata: {
          title: media.title
        }
      }
    });

    await recomputeForMediaItem(mediaId);

    return ok(restored);
  } catch (error) {
    return handleRouteError(error);
  }
}
