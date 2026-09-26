import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { requireLiveAccess } from "@/src/server/live-access";
import { rotateOverlayKey } from "@/src/server/live-graphics";

type RouteContext = { params: Promise<{ eventId: string }> };

/** New OBS URLs for this event. Signed-in producers and managers only, not PIN sessions. */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const access = await requireLiveAccess();
    if (access.kind !== "user") throw new Error("FORBIDDEN");
    const { eventId } = await context.params;
    return okNoStore(await rotateOverlayKey(eventId));
  } catch (error) {
    return handleRouteError(error);
  }
}
