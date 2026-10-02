import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { youtubeAuthorizationStatus } from "@/src/server/youtube-client";
import { requireRealPlatformAdmin } from "@/src/server/youtube-connect-access";

/** Admin → YouTube channel card: is the channel connected, by which authorization, and does Google accept it. */
export async function GET() {
  try {
    await requireRealPlatformAdmin();
    return okNoStore(await youtubeAuthorizationStatus());
  } catch (error) {
    return handleRouteError(error);
  }
}
