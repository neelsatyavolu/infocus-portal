import { fail, okNoStore } from "@/src/lib/http";
import { lookupPairing, pairingRateLimited, submitPairing } from "@/src/server/show-editor-pairing";
import { clientAddress } from "@/src/server/show-editor-rate-limit";
import { editorRouteError, pairSubmitSchema, readEditorBody } from "@/src/server/show-editor-service";

export const dynamic = "force-dynamic";

/**
 * "Connect AI account" from a producer's computer (`infocus-editor connect`). Authorised by the one-time
 * code in the path, NOT the editor token (public in middleware); rate-limited per address.
 */
function limited(request: Request) {
  return pairingRateLimited(clientAddress(request)) ? fail("Too many tries. Wait a few minutes.", 429) : null;
}

/** The Mac's public key to seal the sign-in to, and which backend this code is for. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const refused = limited(request);
  if (refused) return refused;
  try {
    const { code } = await params;
    return okNoStore(await lookupPairing(code));
  } catch (error) {
    return editorRouteError(error);
  }
}

/** The sealed sign-in (base64, at most 65536 characters). The code can be used once. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const refused = limited(request);
  if (refused) return refused;
  try {
    const { code } = await params;
    const { ciphertext } = pairSubmitSchema.parse(await readEditorBody(request));
    return okNoStore(await submitPairing(code, ciphertext));
  } catch (error) {
    return editorRouteError(error);
  }
}
