import { fail, okPublicCached } from "@/src/lib/http";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import { loadShowAnnouncements } from "@/src/server/public-feed";

type RouteContext = { params: Promise<{ date: string }> };

/** Public InFocus app: the announcements read on a show, once that show is public on YouTube. */
export async function GET(_request: Request, context: RouteContext) {
  const { date } = await context.params;
  if (!DATE_KEY_PATTERN.test(date)) return fail("Use a YYYY-MM-DD show date.", 400);
  try {
    const recap = await loadShowAnnouncements(date);
    if (!recap) return fail("No public show on that date.", 404);
    return okPublicCached(recap, 600);
  } catch (error) {
    console.error("Public show announcements failed", error instanceof Error ? error.message : error);
    return fail("Announcements are unavailable right now. Try again soon.", 502);
  }
}
