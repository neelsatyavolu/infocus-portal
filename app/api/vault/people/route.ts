import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { listVaultShareCandidates, requireVaultSharer } from "@/src/server/password-vault";

/** Share picker: Portal members outside the vault. */
export async function GET() {
  try {
    await requireVaultSharer();
    return okNoStore({ people: await listVaultShareCandidates() });
  } catch (error) {
    return handleRouteError(error);
  }
}
