import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { vaultImportSchema } from "@/src/lib/password-vault";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { assertJsonRequest, importVaultEntries, requireVaultActor } from "@/src/server/password-vault";

export async function POST(request: Request) {
  try {
    const actor = await requireVaultActor();
    assertJsonRequest(request);
    if (!limitByKey(getRequestKey(request, `vault:import:${actor.userId}`), { max: 5, windowMs: 60_000 }).allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }
    const { entries } = vaultImportSchema.parse(await request.json());
    return okNoStore(await importVaultEntries(actor, entries), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
