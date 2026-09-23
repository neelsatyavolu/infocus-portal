import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { getWebPushPublicKey, isWebPushConfigured } from "@/src/lib/web-push";

export async function GET() {
  try {
    const publicKey = getWebPushPublicKey();

    return ok({
      publicKey,
      configured: isWebPushConfigured()
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
