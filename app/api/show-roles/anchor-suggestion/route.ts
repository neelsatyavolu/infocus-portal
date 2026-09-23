import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import { suggestAnchorsForDate } from "@/src/server/show-cast";
import { weekOfMonth } from "@/src/show-roles/lib/anchors";

/**
 * Read-only anchor guidance for a given show date, surfaced on the master
 * calendar while planning the month. Weeks 1 and 4 are volunteer weeks; weeks 2
 * and 3 are random. Volunteers and anyone who already anchored this month are
 * out of the random pool.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const dateKey = new URL(request.url).searchParams.get("date");
    if (!dateKey || !DATE_KEY_PATTERN.test(dateKey)) {
      return fail("A valid date is required.", 400);
    }

    const date = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
      return fail("A valid date is required.", 400);
    }

    const suggestion = await suggestAnchorsForDate(dateKey);
    return ok({
      ...suggestion,
      weekOfMonth: weekOfMonth(date)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
