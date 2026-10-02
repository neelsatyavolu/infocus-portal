import { fail, okPublicCached } from "@/src/lib/http";
import { loadPublicShows } from "@/src/server/public-feed";

/** Public InFocus app: every public show by season, the latest one, and upcoming show dates. */
export async function GET() {
  try {
    return okPublicCached(await loadPublicShows(), 300);
  } catch (error) {
    console.error("Public shows failed", error instanceof Error ? error.message : error);
    return fail("Shows are unavailable right now. Try again soon.", 502);
  }
}
