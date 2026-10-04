import { WorkspaceRole } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { createOriginalVideoDownloadToken } from "@/src/lib/bunny";
import { fail } from "@/src/lib/http";
import { isNasVideoId, nasMintDownloadUrl } from "@/src/lib/nas-storage";
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

    // Long TTL so the signed URL remains valid for the full direct
    // browser download after this lightweight auth gate redirects.
    const isNas = version.storageProvider?.toUpperCase() === "NAS" || isNasVideoId(version.bunnyVideoId);
    let downloadUrl: string;
    if (isNas) {
      if (!version.nasPath) {
        throw new Error("NOT_FOUND");
      }
      // inline=0 makes Drive send Content-Disposition: attachment, so the browser saves the file.
      const driveUrl = new URL(await nasMintDownloadUrl(version.nasPath, 60 * 30));
      driveUrl.searchParams.set("inline", "0");
      downloadUrl = driveUrl.toString();
    } else {
      downloadUrl = createOriginalVideoDownloadToken(version.bunnyVideoId, 60 * 30).downloadUrl;
    }

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
