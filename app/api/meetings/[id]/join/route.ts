import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { joinMeeting } from "@/src/server/meetings-join";

export const dynamic = "force-dynamic";

/** Carries the room ticket and (when admitted) the meeting key: never cached. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await requireMeetingViewer();
    return okNoStore(await joinMeeting(viewer, id));
  } catch (error) {
    return handleRouteError(error);
  }
}
