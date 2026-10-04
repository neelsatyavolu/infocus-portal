import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { syncMeetingInvites } from "@/src/server/meetings-invites";

export const dynamic = "force-dynamic";

/** Exec only: "Sync now", a full Google Calendar reconcile (path kept from "Resend all"). */
export async function POST() {
  try {
    const viewer = await requireMeetingViewer();
    return ok(await syncMeetingInvites(viewer));
  } catch (error) {
    return handleRouteError(error);
  }
}
