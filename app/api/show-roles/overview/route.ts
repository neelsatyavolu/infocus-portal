import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import { loadShowOverview } from "@/src/server/show-overview-data";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const requested = new URL(request.url).searchParams.get("date");
    if (requested && !DATE_KEY_PATTERN.test(requested)) {
      return fail("A valid date is required.", 400);
    }

    return ok(await loadShowOverview(requested));
  } catch (error) {
    return handleRouteError(error);
  }
}
