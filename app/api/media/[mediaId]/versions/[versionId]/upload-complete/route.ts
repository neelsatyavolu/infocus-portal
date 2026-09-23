import { MediaStatus } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { requireMediaAccess } from "@/src/server/memberships";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string; versionId: string }> }
) {
  try {
    const { mediaId, versionId } = await params;

    const { media } = await requireMediaAccess(mediaId, undefined, { allowVisibility: true });

    const version = await prisma.mediaVersion.findUnique({
      where: {
        id: versionId
      },
      select: {
        id: true,
        mediaItemId: true,
        status: true
      }
    });

    if (!version || version.mediaItemId !== media.id) {
      throw new Error("NOT_FOUND");
    }

    const updated =
      version.status === MediaStatus.READY || version.status === MediaStatus.FAILED
        ? version
        : await prisma.mediaVersion.update({
            where: {
              id: version.id
            },
            data: {
              status: MediaStatus.PROCESSING
            },
            select: {
              id: true,
              mediaItemId: true,
              status: true
            }
          });

    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
