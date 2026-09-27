import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { limitByKey } from "@/src/lib/rate-limit";
import { MAX_ANNOUNCEMENT_CHARS, MAX_SUMMARY_ANNOUNCEMENTS, isShowDateKey } from "@/src/lib/show-story";
import { canUseStoryMaker } from "@/src/server/social-media-access";
import { ShowSummaryError, listRecapShowDates, loadShowStory, summarizeShowAnnouncements } from "@/src/server/show-story";

/**
 * Instagram Post Maker → Show template. GET loads one show's anchors, announcements and packages;
 * POST summarizes announcements into one line each with Gemini. Producers and social media managers.
 */
const summaryBodySchema = z.object({
  announcements: z.array(z.string().trim().min(1).max(MAX_ANNOUNCEMENT_CHARS)).min(1).max(MAX_SUMMARY_ANNOUNCEMENTS)
});

async function requireStoryMaker() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!(await canUseStoryMaker(user.id, access.role))) throw new Error("FORBIDDEN");
  return user;
}

export async function GET(request: Request) {
  try {
    await requireStoryMaker();
    const requested = new URL(request.url).searchParams.get("date");
    if (requested && !isShowDateKey(requested)) return fail("Pick a show date.", 400);
    const shows = await listRecapShowDates();
    const story = await loadShowStory(requested ?? shows.defaultDate);
    return ok({ ...story, shows: shows.dates });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireStoryMaker();
    if (!limitByKey(`show-summary:${user.id}`, { max: 10, windowMs: 60_000 }).allowed) throw new Error("TOO_MANY_REQUESTS");
    const body = summaryBodySchema.parse(await request.json());
    return ok({ summaries: await summarizeShowAnnouncements(body.announcements) });
  } catch (error) {
    if (error instanceof ShowSummaryError) return fail(error.message, error.status);
    return handleRouteError(error);
  }
}
