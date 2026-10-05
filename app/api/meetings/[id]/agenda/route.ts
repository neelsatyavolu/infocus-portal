import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { agendaTextSchema } from "@/src/lib/meetings/agenda-schema";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { addAgendaItem, getAgenda } from "@/src/server/meetings-agenda";

export const dynamic = "force-dynamic";

const addSchema = z.object({ text: agendaTextSchema }).strict();

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const viewer = await requireMeetingViewer();
    return ok(await getAgenda(viewer, id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const viewer = await requireMeetingViewer();
    const body = addSchema.parse(await request.json());
    return ok(await addAgendaItem(viewer, id, body.text), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
