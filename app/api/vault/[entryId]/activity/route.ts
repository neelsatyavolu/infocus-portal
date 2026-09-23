import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { listVaultActivity, requireVaultActor } from "@/src/server/password-vault";

export async function GET(_request: Request, { params }: { params: Promise<{ entryId: string }> }) {
  try {
    await requireVaultActor();
    const { entryId } = await params;
    return okNoStore(await listVaultActivity(entryId));
  } catch (error) {
    return handleRouteError(error);
  }
}
