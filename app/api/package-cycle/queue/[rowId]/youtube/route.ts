import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { startYoutubePublication } from "@/src/server/youtube-publishing";

/** Producers start a queued package's YouTube upload now instead of waiting for its air date. */
export async function POST(
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

    const error = await startYoutubePublication(rowId);
    if (error) {
      return fail(error, 409);
    }
    return ok({ started: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
