import { WorkspaceRole } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { buildMediaVersionImageUrl } from "@/src/lib/media-assets";
import { resolveThumbnailUrl } from "@/src/lib/media-playback";
import { nasPosterPath, nasUploadBytes, nasMintDownloadUrl } from "@/src/lib/nas-storage";
import { prisma } from "@/src/lib/prisma";
import { requireMediaAccess } from "@/src/server/memberships";

/**
 * The poster the web tiles show for one version: the image route for images, the Bunny or Drive
 * poster for ready videos, else null. Drive posters are signed URLs that expire after 6 hours.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string; versionId: string }> }
) {
  try {
    const { mediaId, versionId } = await params;
    await requireMediaAccess(
      mediaId,
      [WorkspaceRole.OWNER_ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.REVIEWER],
      { allowVisibility: true }
    );

    const version = await prisma.mediaVersion.findFirst({
      where: { id: versionId, mediaItemId: mediaId }
    });
    if (!version) {
      throw new Error("NOT_FOUND");
    }

    const thumbnailUrl =
      version.sourceType === "IMAGE" ? buildMediaVersionImageUrl(mediaId, version.id) : await resolveThumbnailUrl(version);
    return ok({ thumbnailUrl });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Upload a JPEG poster for a NAS-backed media version (stored next to the video as poster.jpg).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaId: string; versionId: string }> }
) {
  try {
    const { mediaId, versionId } = await params;
    await requireMediaAccess(mediaId, undefined, { allowVisibility: true });

    const version = await prisma.mediaVersion.findFirst({
      where: { id: versionId, mediaItemId: mediaId }
    });

    if (!version) {
      throw new Error("NOT_FOUND");
    }
    if (version.storageProvider !== "NAS" || !version.nasPath) {
      throw new Error("BAD_REQUEST");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      throw new Error("BAD_REQUEST");
    }

    // File/Blob from FormData (runtime has Blob API on Vercel)
    const blob = file as Blob;
    const posterPath = nasPosterPath(version.nasPath);
    await nasUploadBytes(posterPath, blob, "poster.jpg", "image/jpeg");

    const thumbnailUrl = await nasMintDownloadUrl(posterPath, 60 * 60 * 6);

    return ok({
      posterPath,
      thumbnailUrl
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
