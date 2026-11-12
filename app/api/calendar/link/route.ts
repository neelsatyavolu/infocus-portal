import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { mainAppOrigin } from "@/src/lib/hosts";
import { okNoStore } from "@/src/lib/http";
import { calendarFeedPath, createCalendarFeedToken } from "@/src/server/calendar-feed-token";

/** The signed-in person's own calendar feed link (Settings → Calendar feed). */
export async function GET() {
  try {
    const userId = await requireUserId();
    await syncUserProfile(userId);
    const httpsUrl = `${mainAppOrigin()}${calendarFeedPath(createCalendarFeedToken(userId))}`;
    return okNoStore({ httpsUrl, webcalUrl: httpsUrl.replace(/^https?:\/\//, "webcal://") });
  } catch (error) {
    return handleRouteError(error);
  }
}
