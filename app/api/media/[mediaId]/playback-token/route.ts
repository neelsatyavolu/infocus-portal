import { WorkspaceRole } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { resolvePlaybackUrl } from "@/src/lib/media-playback";
import { prisma } from "@/src/lib/prisma";
import { requireMediaAccess } from "@/src/server/memberships";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params;
    const { searchParams } = new URL(request.url);
    const mediaVersionId = searchParams.get("mediaVersionId");

    const { media } = await requireMediaAccess(
      mediaId,
      [WorkspaceRole.OWNER_ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.REVIEWER],
      {
        allowVisibility: true
      }
    );

    const version = mediaVersionId
      ? await prisma.mediaVersion.findUnique({ where: { id: mediaVersionId } })
      : await prisma.mediaVersion.findUnique({ where: { id: media.currentVersionId ?? "" } });

    if (!version || version.mediaItemId !== media.id) {
      throw new Error("NOT_FOUND");
    }

    const playbackUrl = await resolvePlaybackUrl(version);
    if (!playbackUrl) {
      throw new Error("NOT_FOUND");
    }

    // Shape matches Bunny token response + NAS progressive URL
    return ok({
      playbackUrl,
      provider: version.storageProvider || "BUNNY",
      nasPath: version.nasPath,
      expiresAt: Math.floor(Date.now() / 1000) + 30 * 60
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
