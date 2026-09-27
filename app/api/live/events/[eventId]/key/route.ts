import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { requireLiveAccess } from "@/src/server/live-access";
import { rotateOverlayKey } from "@/src/server/live-graphics";

type RouteContext = { params: Promise<{ eventId: string }> };

/** New OBS URLs for this event. Signed-in producers and livestream managers only, never PIN sessions. */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const access = await requireLiveAccess();
    if (access.kind !== "user" || !access.canManage) throw new Error("FORBIDDEN");
    const { eventId } = await context.params;
    return okNoStore(await rotateOverlayKey(eventId));
  } catch (error) {
    return handleRouteError(error);
  }
}
