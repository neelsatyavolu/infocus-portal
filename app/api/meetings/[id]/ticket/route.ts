import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { issueRoomTicketForViewer } from "@/src/server/meetings-ticket";

export const dynamic = "force-dynamic";

/**
 * Refresh the room ticket (and key) for someone already in the call. Carries secrets: never cached.
 * 401 signed out · 403 not admitted or removed · 404 not visible · 410 ended or cancelled.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await requireMeetingViewer();
    return okNoStore(await issueRoomTicketForViewer(viewer, id));
  } catch (error) {
    return handleRouteError(error);
  }
}
