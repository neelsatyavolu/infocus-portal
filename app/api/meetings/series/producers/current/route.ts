import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { getProducerSeriesCurrent } from "@/src/server/meetings-schedule";

export const dynamic = "force-dynamic";

/** Stable Producer meeting link: the live occurrence, else the next one that hasn't ended. */
export async function GET() {
  try {
    const viewer = await requireMeetingViewer();
    return ok({ meeting: await getProducerSeriesCurrent(viewer) });
  } catch (error) {
    return handleRouteError(error);
  }
}
