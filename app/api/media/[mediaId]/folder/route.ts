import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { recomputeForMediaItem } from "@/src/server/cycle-cut-status";
import { requireMediaAccess } from "@/src/server/memberships";

const updateMediaFolderSchema = z.object({
  folderId: z.string().cuid().nullable()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const payload = updateMediaFolderSchema.parse(await request.json());
    const { mediaId } = await params;
    const { userId, media } = await requireMediaAccess(mediaId);

    if (payload.folderId) {
      const folder = await prisma.projectFolder.findFirst({
        where: {
          id: payload.folderId,
          projectId: media.projectId
        }
      });

      if (!folder) {
        throw new Error("BAD_REQUEST");
      }
    }

    const updated = await prisma.mediaItem.update({
      where: { id: mediaId },
      data: {
        folderId: payload.folderId
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: media.project.workspaceId,
        projectId: media.projectId,
        mediaItemId: mediaId,
        actorId: userId,
        type: "media.moved_to_folder",
        payload: {
          folderId: payload.folderId
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: media.project.workspaceId,
        projectId: media.projectId,
        mediaItemId: mediaId,
        actorId: userId,
        action: "media.move_folder",
        targetType: "MediaItem",
        targetId: mediaId,
        metadata: {
          folderId: payload.folderId
        }
      }
    });

    await recomputeForMediaItem(mediaId);

    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
