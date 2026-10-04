import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { sendAllMeetingInvites } from "@/src/server/meetings-invites";

export const dynamic = "force-dynamic";

/** Exec only: queue a resend of the Producer meeting calendar invite to every address. */
export async function POST() {
  try {
    const viewer = await requireMeetingViewer();
    return ok(await sendAllMeetingInvites(viewer));
  } catch (error) {
    return handleRouteError(error);
  }
}
