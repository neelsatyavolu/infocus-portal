import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { okUnmapped } from "@/src/lib/http";
import { SIGNATURE_MAX_LENGTH } from "@/src/lib/signature-image";
import { deleteSignature, loadSignature, requireSignatureOwner, saveSignature } from "@/src/server/user-signature";

const saveSchema = z.object({
  signature: z.string().min(1).max(SIGNATURE_MAX_LENGTH)
});

/** Settings → Signature. 403 for everyone but executive producers and the super admin, which hides the section. */
export async function GET() {
  try {
    const userId = await requireSignatureOwner();
    return okUnmapped({ signature: await loadSignature(userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireSignatureOwner();
    const parsed = saveSchema.safeParse(await request.json());
    if (!parsed.success) throw new Error("That signature couldn't be saved. Clear it and draw it again.");
    return okUnmapped({ signature: await saveSignature(userId, parsed.data.signature) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE() {
  try {
    const userId = await requireSignatureOwner();
    await deleteSignature(userId);
    return okUnmapped({ signature: null });
  } catch (error) {
    return handleRouteError(error);
  }
}
