import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { requireLiveAccess } from "@/src/server/live-access";
import { listLiveEvents } from "@/src/server/live-graphics";

export async function GET() {
  try {
    await requireLiveAccess();
    return okNoStore({ events: await listLiveEvents() });
  } catch (error) {
    return handleRouteError(error);
  }
}
