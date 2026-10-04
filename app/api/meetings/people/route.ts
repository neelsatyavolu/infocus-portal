import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { listMeetingPeople } from "@/src/server/meetings-people";

export const dynamic = "force-dynamic";

/** Invitee picker: every producer, by display name. */
export async function GET() {
  try {
    await requireMeetingViewer();
    return ok({ people: await listMeetingPeople() });
  } catch (error) {
    return handleRouteError(error);
  }
}
