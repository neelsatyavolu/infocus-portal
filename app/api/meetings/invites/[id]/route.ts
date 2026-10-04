import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { linkMeetingInvite, removeMeetingInvite } from "@/src/server/meetings-invites";

export const dynamic = "force-dynamic";

const linkSchema = z.object({ userId: z.string().min(1).max(64).nullable() }).strict();

/** Exec only: link this address to a producer, or unlink it (`userId: null`). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await requireMeetingViewer();
    const { userId } = linkSchema.parse(await request.json());
    return ok(await linkMeetingInvite(viewer, id, userId));
  } catch (error) {
    return handleRouteError(error);
  }
}

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
