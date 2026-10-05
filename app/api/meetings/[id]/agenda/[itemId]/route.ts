import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { agendaTextSchema } from "@/src/lib/meetings/agenda-schema";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { deleteAgendaItem, updateAgendaItem } from "@/src/server/meetings-agenda";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({ text: agendaTextSchema.optional(), done: z.boolean().optional() })
  .strict()
  .refine((body) => body.text !== undefined || body.done !== undefined, { message: "Nothing to change." });

type Context = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id, itemId } = await params;
    const viewer = await requireMeetingViewer();
    const body = patchSchema.parse(await request.json());
    return ok(await updateAgendaItem(viewer, id, itemId, body));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id, itemId } = await params;
    const viewer = await requireMeetingViewer();
    return ok(await deleteAgendaItem(viewer, id, itemId));
  } catch (error) {
    return handleRouteError(error);
  }
}
