import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { vaultShareSchema } from "@/src/lib/password-vault";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import {
  assertJsonRequest,
  listVaultEntryShares,
  requireVaultSharer,
  setVaultEntryShares
} from "@/src/server/password-vault";

type Context = { params: Promise<{ entryId: string }> };

/** Who this login is shared with (executive producers and up). */
export async function GET(_request: Request, { params }: Context) {
  try {
    await requireVaultSharer();
    const { entryId } = await params;
    return okNoStore({ people: await listVaultEntryShares(entryId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Replaces the list of people this login is shared with. */
export async function PUT(request: Request, { params }: Context) {
  try {
    const actor = await requireVaultSharer();
    assertJsonRequest(request);
    if (!limitByKey(getRequestKey(request, `vault:write:${actor.userId}`), { max: 30, windowMs: 60_000 }).allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }
    const { entryId } = await params;
    const { userIds } = vaultShareSchema.parse(await request.json());
    return okNoStore({ people: await setVaultEntryShares(actor, entryId, userIds) });
  } catch (error) {
    return handleRouteError(error);
  }
}
