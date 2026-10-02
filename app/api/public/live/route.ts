import { fail, okPublicCached } from "@/src/lib/http";
import { loadPublicLive } from "@/src/server/public-feed";

/** Public InFocus app: livestreams on now, coming up, and recently ended. */
export async function GET() {
  try {
    return okPublicCached(await loadPublicLive(), 60);
  } catch (error) {
    console.error("Public live feed failed", error instanceof Error ? error.message : error);
    return fail("Livestreams are unavailable right now. Try again soon.", 502);
  }
}
