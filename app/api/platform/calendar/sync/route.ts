import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { syncSchoolCalendar } from "@/src/server/school-calendar-sync";

/** Sync now in Admin → Configuration: the same run the daily job does. */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!access.canManageAccounts && !access.isExecutiveProducer && !access.isAdviser) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(getRequestKey(request, "platform:calendar:sync"), { max: 6, windowMs: 60_000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    return ok(await syncSchoolCalendar());
  } catch (error) {
    return handleRouteError(error);
  }
}
