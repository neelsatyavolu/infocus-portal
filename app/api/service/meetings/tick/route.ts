import { handleRouteError } from "@/src/lib/api-errors";
import { fail, ok } from "@/src/lib/http";
import { MEETING_TICK_TOKEN_ID } from "@/src/lib/meetings/room-token";
import { checkRoomCaller, runMeetingTick } from "@/src/server/meetings-service";

export const dynamic = "force-dynamic";
// Ticks arrive every minute; a run is cut off before the next one could pile onto it.
export const maxDuration = 60;

/** meeting-room Worker cron, every minute (Bearer internal token signed "room" for the tick; public in middleware). */
export async function POST(request: Request) {
  try {
    const caller = await checkRoomCaller(request, MEETING_TICK_TOKEN_ID);
    if (caller === "unconfigured") return fail("Meetings are not configured", 503);
    if (caller === "denied") return fail("Unauthorized", 401);
    const { failed, ...result } = await runMeetingTick();
    return failed ? fail("Meetings tick failed", 500) : ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
