import { WorkspaceRole } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { prisma } from "@/src/lib/prisma";
import { requireGuestLink } from "@/src/server/guest-access";
import { requireMediaAccess } from "@/src/server/memberships";

async function assertCanReadImageVersion(mediaId: string, versionId: string, guestToken: string | null) {
  if (guestToken) {
    await requireGuestLink(guestToken, {
      mediaVersionId: versionId
    });
    return;
  }

  await requireMediaAccess(
    mediaId,
    [WorkspaceRole.OWNER_ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.REVIEWER],
    { allowVisibility: true }
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string; versionId: string }> }
) {
  try {
    const { mediaId, versionId } = await params;
    const guestToken = new URL(request.url).searchParams.get("guestToken");

    await assertCanReadImageVersion(mediaId, versionId, guestToken);

    const version = await prisma.mediaVersion.findUnique({
      where: {
        id: versionId
      },
      select: {
        id: true,
        mediaItemId: true,
        sourceType: true,
        imageMimeType: true,
        imageBase64: true,
        updatedAt: true
      }
    });

    if (!version || version.mediaItemId !== mediaId || version.sourceType !== "IMAGE" || !version.imageBase64) {
      throw new Error("NOT_FOUND");
    }

    const body = Buffer.from(version.imageBase64, "base64");
    const contentType = version.imageMimeType || "image/jpeg";

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
