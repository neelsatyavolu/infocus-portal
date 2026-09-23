import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { vaultEntryInputSchema } from "@/src/lib/password-vault";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { assertJsonRequest, createVaultEntry, listVaultEntries, requireVaultActor } from "@/src/server/password-vault";

export async function GET() {
  try {
    const actor = await requireVaultActor();
    return okNoStore(await listVaultEntries(actor));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireVaultActor();
    assertJsonRequest(request);
    if (!limitByKey(getRequestKey(request, `vault:write:${actor.userId}`), { max: 30, windowMs: 60_000 }).allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }
    const payload = vaultEntryInputSchema.parse(await request.json());
    return okNoStore(await createVaultEntry(actor, payload), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
