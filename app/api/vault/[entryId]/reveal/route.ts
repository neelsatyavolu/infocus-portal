import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { VAULT_REVEAL_FIELDS } from "@/src/lib/password-vault";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { assertJsonRequest, requireVaultActor, revealVaultField } from "@/src/server/password-vault";

const payloadSchema = z.object({ field: z.enum(VAULT_REVEAL_FIELDS) });

export async function POST(request: Request, { params }: { params: Promise<{ entryId: string }> }) {
  try {
    const actor = await requireVaultActor();
    assertJsonRequest(request);
    if (!limitByKey(getRequestKey(request, `vault:reveal:${actor.userId}`), { max: 60, windowMs: 60_000 }).allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }
    const { entryId } = await params;
    const { field } = payloadSchema.parse(await request.json());
    return okNoStore(await revealVaultField(actor, entryId, field));
  } catch (error) {
    return handleRouteError(error);
  }
}
