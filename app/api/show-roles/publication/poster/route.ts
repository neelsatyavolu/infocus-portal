import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import { saveShowPoster, ShowUploadError } from "@/src/server/show-publishing";

// YouTube's custom thumbnail limit.
const MAX_POSTER_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const form = await request.formData();
    const showDate = form.get("showDate");
    const file = form.get("file");
    if (typeof showDate !== "string" || !DATE_KEY_PATTERN.test(showDate) || !file || typeof file === "string") {
      return fail("A show date and JPEG thumbnail are required.", 400);
    }
    if (file.type !== "image/jpeg" || file.size === 0 || file.size > MAX_POSTER_BYTES) {
      return fail("The thumbnail must be a JPEG under 2 MB.", 400);
    }
    await saveShowPoster({ showDate, poster: file });
    return ok({ saved: true });
  } catch (error) {
    if (error instanceof ShowUploadError) return fail(error.message, error.status);
    return handleRouteError(error);
  }
}
