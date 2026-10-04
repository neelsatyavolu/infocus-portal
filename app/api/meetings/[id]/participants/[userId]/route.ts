import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { actOnParticipant } from "@/src/server/meetings-moderation";

export const dynamic = "force-dynamic";

const actionSchema = z.object({ action: z.enum(["admit", "deny", "remove"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { id, userId } = await params;
    const viewer = await requireMeetingViewer();
    const { action } = actionSchema.parse(await request.json());
    return ok(await actOnParticipant(viewer, id, userId, action));
  } catch (error) {
    return handleRouteError(error);
  }
}
