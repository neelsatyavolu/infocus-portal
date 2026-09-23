import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { vaultEntryUpdateSchema } from "@/src/lib/password-vault";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { assertJsonRequest, deleteVaultEntry, requireVaultActor, updateVaultEntry } from "@/src/server/password-vault";

type Context = { params: Promise<{ entryId: string }> };

function enforceWriteLimit(request: Request, userId: string) {
  if (!limitByKey(getRequestKey(request, `vault:write:${userId}`), { max: 30, windowMs: 60_000 }).allowed) {
    throw new Error("TOO_MANY_REQUESTS");
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireVaultActor();
    enforceWriteLimit(request, actor.userId);
    assertJsonRequest(request);
    const { entryId } = await params;
    const payload = vaultEntryUpdateSchema.parse(await request.json());
    return okNoStore(await updateVaultEntry(actor, entryId, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireVaultActor();
    enforceWriteLimit(request, actor.userId);
    const { entryId } = await params;
    return okNoStore(await deleteVaultEntry(actor, entryId));
  } catch (error) {
    return handleRouteError(error);
  }
}
