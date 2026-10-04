import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { removeMeetingInvite } from "@/src/server/meetings-invites";

export const dynamic = "force-dynamic";

/** Exec only: drop an address and send it a cancel for the series. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await requireMeetingViewer();
    return ok(await removeMeetingInvite(viewer, id));
  } catch (error) {
    return handleRouteError(error);
  }
}
