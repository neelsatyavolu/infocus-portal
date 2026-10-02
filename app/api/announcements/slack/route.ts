import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId } from "@/src/lib/auth";
import { okUnmapped } from "@/src/lib/http";
import { loadSlackAnnouncements } from "@/src/server/slack-announcements";

/** The #announcements feed as JSON (what /announcements shows), for the iPhone app. */
export async function GET() {
  try {
    await requireUserId();
    const { configured, items, error } = await loadSlackAnnouncements();
    return okUnmapped({ configured, items, error });
  } catch (error) {
    return handleRouteError(error);
  }
}
