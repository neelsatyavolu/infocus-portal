import { MediaStatus } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { requireMediaAccess } from "@/src/server/memberships";

/**
 * Mark a NAS-backed version READY after the browser finished uploading to Drive.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string; versionId: string }> }
) {
  try {
    const { mediaId, versionId } = await params;
    const { userId, media } = await requireMediaAccess(mediaId, undefined, {
      allowVisibility: true
    });

    const version = await prisma.mediaVersion.findFirst({
      where: { id: versionId, mediaItemId: media.id }
    });

    if (!version) {
      throw new Error("NOT_FOUND");
    }
    if (version.storageProvider !== "NAS") {
      throw new Error("BAD_REQUEST");
    }

    const updated = await prisma.mediaVersion.update({
      where: { id: version.id },
      data: {
        status: MediaStatus.READY,
        storageSyncedAt: new Date()
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: media.project.workspaceId,
        projectId: media.project.id,
        mediaItemId: media.id,
        mediaVersionId: version.id,
        actorId: userId,
        type: "media.upload.completed",
        payload: {
          storageProvider: "NAS",
          nasPath: version.nasPath
        }
      }
    });

    return ok({ version: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
