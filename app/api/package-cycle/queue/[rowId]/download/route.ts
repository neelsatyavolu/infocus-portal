import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail } from "@/src/lib/http";
import { resolveOriginalDownloadUrl } from "@/src/lib/media-playback";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rowId: string }> }
) {
  try {
    const { rowId } = await params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const row = await prisma.packageProgressRow.findUnique({
      where: { id: rowId },
      select: {
        finalCutMediaItem: {
          select: { currentVersion: true }
        }
      }
    });
    if (!row) {
      throw new Error("NOT_FOUND");
    }

    const version = row.finalCutMediaItem?.currentVersion;
    if (!version) {
      return fail("This package does not have a final cut to download.", 409);
    }

    const downloadUrl = await resolveOriginalDownloadUrl(version);
    if (!downloadUrl) {
      return fail("The final cut is not ready to download.", 409);
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
