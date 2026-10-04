import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { meetingsCalendarStatus } from "@/src/server/meetings-google-calendar";
import { requireRealPlatformAdmin } from "@/src/server/youtube-connect-access";

/** Admin → Google Calendar card: the connected account and how the last meetings sync went. */
export async function GET() {
  try {
    await requireRealPlatformAdmin();
    return okNoStore(await meetingsCalendarStatus());
  } catch (error) {
    return handleRouteError(error);
  }
}
