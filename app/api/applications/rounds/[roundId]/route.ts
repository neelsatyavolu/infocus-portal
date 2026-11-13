import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireManager } from "@/src/server/applications/access";
import { roundSettingsSchema, updateRound } from "@/src/server/applications/rounds";

type Context = { params: Promise<{ roundId: string }> };

/** Save a round's settings (EPs + super admin). */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { roundId } = await params;
    const viewer = await requireManager();
    const input = roundSettingsSchema.parse(await request.json());
    await updateRound(viewer, roundId, input);
    return ok({ saved: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
