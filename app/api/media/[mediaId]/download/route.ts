import { WorkspaceRole } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { createOriginalVideoDownloadToken } from "@/src/lib/bunny";
import { fail } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { requireMediaAccess } from "@/src/server/memberships";

export const maxDuration = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params;
    const { searchParams } = new URL(request.url);
    const mediaVersionId = searchParams.get("mediaVersionId");

    const { media } = await requireMediaAccess(mediaId, [
      WorkspaceRole.OWNER_ADMIN,
      WorkspaceRole.EDITOR,
      WorkspaceRole.REVIEWER
    ], {
      allowVisibility: true
    });

    const version = mediaVersionId
      ? await prisma.mediaVersion.findUnique({ where: { id: mediaVersionId } })
      : await prisma.mediaVersion.findUnique({ where: { id: media.currentVersionId ?? "" } });

    if (!version || version.mediaItemId !== media.id) {
      throw new Error("NOT_FOUND");
    }

    if (version.sourceType !== "VIDEO") {
      return fail("Only video versions can be downloaded from this endpoint.", 400);
    }

    // Long TTL so the signed Bunny URL remains valid for the full direct
    // browser download after this lightweight auth gate redirects.
    const { downloadUrl } = createOriginalVideoDownloadToken(version.bunnyVideoId, 60 * 30);

    return new Response(null, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
        Location: downloadUrl
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
