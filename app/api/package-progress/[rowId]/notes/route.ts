import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { PACKAGE_ROSTER_NOTE_MAX } from "@/src/lib/package-roster-notes";
import { loadGroupRosterNotes, saveGroupRosterNotes } from "@/src/server/group-roster-notes";

const payloadSchema = z.object({ possibleIdeas: z.string().max(PACKAGE_ROSTER_NOTE_MAX) }).strict();
type Context = { params: Promise<{ rowId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { rowId } = await context.params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    return ok(await loadGroupRosterNotes(rowId, userId, access.role));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { rowId } = await context.params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const payload = payloadSchema.parse(await request.json());
    return ok(await saveGroupRosterNotes(rowId, userId, access.role, payload.possibleIdeas));
  } catch (error) {
    return handleRouteError(error);
  }
}
