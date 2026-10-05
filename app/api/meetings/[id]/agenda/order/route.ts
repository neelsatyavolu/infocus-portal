import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { AGENDA_MAX_ITEMS } from "@/src/lib/meetings/agenda";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { reorderAgenda } from "@/src/server/meetings-agenda";

export const dynamic = "force-dynamic";

const orderSchema = z.object({ itemIds: z.array(z.string().min(1).max(64)).max(AGENDA_MAX_ITEMS) }).strict();

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const viewer = await requireMeetingViewer();
    const body = orderSchema.parse(await request.json());
    return ok(await reorderAgenda(viewer, id, body.itemIds));
  } catch (error) {
    return handleRouteError(error);
  }
}
