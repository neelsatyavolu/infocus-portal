import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { requireLiveAccess } from "@/src/server/live-access";
import { listLiveEvents, listPastLiveEvents } from "@/src/server/live-graphics";

export async function GET() {
  try {
    await requireLiveAccess();
    const [events, pastEvents] = await Promise.all([listLiveEvents(), listPastLiveEvents()]);
    return okNoStore({ events, pastEvents });
  } catch (error) {
    return handleRouteError(error);
  }
}
