import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { addMeetingInvite, listMeetingInvites } from "@/src/server/meetings-invites";

export const dynamic = "force-dynamic";

const addInviteSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().max(120).optional()
});

export async function GET() {
  try {
    const viewer = await requireMeetingViewer();
    return ok(await listMeetingInvites(viewer));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Exec only: add an address and email it the Producer meeting calendar invite. */
export async function POST(request: Request) {
  try {
    const viewer = await requireMeetingViewer();
    const body = addInviteSchema.parse(await request.json());
    return ok(await addMeetingInvite(viewer, body), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
