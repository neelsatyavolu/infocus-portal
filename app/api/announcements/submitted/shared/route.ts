import { handleRouteError } from "@/src/lib/api-errors";
import { verifySubmittedAnnouncementShareToken } from "@/src/lib/announcement-share";
import { fail, ok } from "@/src/lib/http";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { fetchSubmittedAnnouncements } from "@/src/server/announcement-submissions";

export async function GET(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "announcements:shared"), { max: 60, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const token = new URL(request.url).searchParams.get("token");
    const parsed = verifySubmittedAnnouncementShareToken(token);
    if (!parsed) {
      return fail("This invite link is invalid or has expired.", 401);
    }

    const data = await fetchSubmittedAnnouncements({ includeSchoologyOnly: true });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
