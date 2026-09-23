import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { requireBrainstormViewer } from "@/src/server/package-brainstorm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ proofId: string }> }
) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const { proofId } = await params;

    const proof = await prisma.packageProofOfContact.findUnique({
      where: { id: proofId },
      select: {
        id: true,
        rowId: true,
        mimeType: true,
        imageBase64: true,
        updatedAt: true
      }
    });

    if (!proof) {
      throw new Error("NOT_FOUND");
    }

    await requireBrainstormViewer(proof.rowId, userId, user.email);

    const body = Buffer.from(proof.imageBase64, "base64");
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": proof.mimeType || "image/jpeg",
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
