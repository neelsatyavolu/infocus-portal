import { handleRouteError } from "@/src/lib/api-errors";
import { fail, okNoStore } from "@/src/lib/http";
import { getOverlayByKey } from "@/src/server/live-graphics";

type RouteContext = { params: Promise<{ key: string }> };

/** Public, read-only: OBS Browser Sources poll this every second with the event's overlay key. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { key } = await context.params;
    const overlay = await getOverlayByKey(key);
    if (!overlay) return fail("Overlay not found.", 404);
    return okNoStore(overlay);
  } catch (error) {
    return handleRouteError(error);
  }
}
