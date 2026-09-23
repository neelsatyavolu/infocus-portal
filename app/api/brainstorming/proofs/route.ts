import { recordAssociateReviewHistory } from "@/src/server/associate-review-history";
import { z } from "zod";
import { brainstormBecameReady } from "@/src/lib/package-stage-events";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import {
  isProofImageFile,
  isProofOfContactSlot,
  MAX_PROOF_IMAGE_BYTES,
  serializeProofs
} from "@/src/lib/package-brainstorm";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { requireBrainstormMember } from "@/src/server/package-brainstorm";

const slotSchema = z.coerce.number().int();

export async function POST(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "brainstorming:upload"), {
      max: 20,
      windowMs: 60 * 1000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const form = await request.formData();
    const rowId = String(form.get("rowId") ?? "");
    const slot = slotSchema.parse(form.get("slot"));
    const file = form.get("file");

    if (!rowId || !isProofOfContactSlot(slot)) {
      throw new Error("BAD_REQUEST");
    }
    if (!(file instanceof File) || !isProofImageFile(file)) {
      return fail(
        file instanceof File && file.size > MAX_PROOF_IMAGE_BYTES
          ? "Image is too large. Use a smaller screenshot or photo."
          : "Upload a JPG, PNG, or WebP image.",
        400
      );
    }

    const { row } = await requireBrainstormMember(rowId, userId, user.email);
    const before = { proofCount: row.proofOfContacts.length, docUrl: row.brainstormDocUrl };
    const afterSlots = new Set(row.proofOfContacts.map((proof) => proof.slot));
    afterSlots.add(slot);

    const imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const fileName = file.name.trim().slice(0, 180) || `proof-${slot}.jpg`;

    const becameReady = brainstormBecameReady(before, { proofCount: afterSlots.size, docUrl: row.brainstormDocUrl });
    const proof = await prisma.$transaction(async (tx) => {
      const proof = await tx.packageProofOfContact.upsert({
        where: { rowId_slot: { rowId, slot } },
        create: {
          rowId,
          slot,
          fileName,
          mimeType: file.type,
          imageBase64,
          uploadedByUserId: userId
        },
        update: {
          fileName,
          mimeType: file.type,
          imageBase64,
          uploadedByUserId: userId
        },
        select: { id: true, slot: true, fileName: true, mimeType: true }
      });
      if (becameReady) {
        await recordAssociateReviewHistory({ rowId: row.id, stage: "brainstorming", kind: "ready", actorId: userId }, tx);
      }
      return proof;
    });

    const { publishProofOfContactToSlack } = await import("@/src/server/proof-of-contact-slack");
    void publishProofOfContactToSlack(row).catch((error) =>
      console.error("publishProofOfContactToSlack failed", error)
    );

    if (becameReady) {
      const { notifyBrainstormMaterialsReady } = await import("@/src/server/package-review-notify");
      void notifyBrainstormMaterialsReady(row.id).catch((error) =>
        console.error("notifyBrainstormMaterialsReady failed", error)
      );
    }

    return ok({ proof: serializeProofs([proof])[0] }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const { searchParams } = new URL(request.url);
    const rowId = searchParams.get("rowId") ?? "";
    const slot = slotSchema.parse(searchParams.get("slot"));

    if (!rowId || !isProofOfContactSlot(slot)) {
      throw new Error("BAD_REQUEST");
    }

    await requireBrainstormMember(rowId, userId, user.email);

    await prisma.packageProofOfContact.deleteMany({
      where: { rowId, slot }
    });

    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
