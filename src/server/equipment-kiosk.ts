import { randomUUID } from "node:crypto";
import { decideKioskScan } from "@/src/lib/equipment-checkout";
import { requireEquipmentStation } from "@/src/server/equipment-station";
import { prisma } from "@/src/lib/prisma";
import { resolveEquipmentStudentContact } from "@/src/server/equipment-students";

function outToLabel(item: {
  checkedOutById: string | null;
  checkedOutBy: { name: string | null; studentId: string } | null;
}) {
  const name = item.checkedOutBy?.name?.trim();
  if (name) {
    return name;
  }
  return item.checkedOutBy?.studentId || item.checkedOutById || "unknown";
}

export async function listKioskItems(stationToken?: string) {
  await requireEquipmentStation(stationToken);
  return prisma.equipmentItem.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, barcode: true },
    orderBy: [{ name: "asc" }, { barcode: "asc" }]
  });
}

export async function kioskCheckout(input: { stationToken: string; studentName: string; studentEmail: string; barcode: string }) {
  const batch = await kioskCheckoutBatch({ ...input, barcodes: [input.barcode] });
  return batch.results[0];
}

export async function kioskCheckoutBatch(input: {
  stationToken: string;
  studentName: string;
  studentEmail: string;
  barcodes: string[];
  tookSdCard?: boolean;
}) {
  await requireEquipmentStation(input.stationToken);

  const student = await resolveEquipmentStudentContact(input.studentName, input.studentEmail);
  const barcodes = input.barcodes.map((code) => code.trim());
  if (!barcodes.length || barcodes.length > 50 || barcodes.some((code) => !code)) {
    throw new Error("Enter between 1 and 50 item codes.");
  }
  if (new Set(barcodes).size !== barcodes.length) {
    throw new Error("Each item code must be unique.");
  }
  const items = await Promise.all(barcodes.map((barcode) => prisma.equipmentItem.findUnique({
    where: { barcode },
    include: { checkedOutBy: { select: { name: true, studentId: true } } }
  })));
  const entries = items.map((item, index) => {
    const decision = decideKioskScan({ studentId: student.id, item });
    if (!item || decision.action === "error") {
      if (!item || (decision.action === "error" && decision.code === "NOT_FOUND")) {
        throw new Error(`Unknown item code: ${barcodes[index]}.`);
      }
      if (decision.action === "error" && decision.code === "OUT_TO_OTHER") {
        throw new Error(`${barcodes[index]}: Out to ${outToLabel(item)}.`);
      }
      throw new Error(`${barcodes[index]}: Held for another request.`);
    }
    return { item, decision, barcode: barcodes[index] };
  });
  if (input.tookSdCard && entries.every(({ decision }) => decision.action === "return")) {
    throw new Error("Only select an SD card when checking out equipment.");
  }
  const now = new Date();
  const metadata = { batchId: randomUUID(), tookSdCard: input.tookSdCard ?? false };

  return prisma.$transaction(async (tx) => {
    const results = [];
    for (const { item, decision, barcode } of entries) {
      if (decision.action === "return") {
        const checkout = await tx.equipmentCheckout.findFirst({
          where: { itemId: item.id, studentIdRef: student.id, status: "CHECKED_OUT" },
          orderBy: { checkoutAt: "desc" }
        });
        if (!checkout) {
          throw new Error("BAD_REQUEST");
        }

        const returned = await tx.equipmentCheckout.update({
          where: { id: checkout.id },
          data: { status: "RETURNED", returnAt: now }
        });
        const cleared = await tx.equipmentItem.updateMany({
          where: { id: item.id, checkedOutById: student.id },
          data: { checkedOut: false, checkedOutById: null, checkedOutAt: null }
        });
        if (cleared.count !== 1) {
          throw new Error("CONFLICT");
        }
        const updatedItem = await tx.equipmentItem.findUnique({ where: { id: item.id } });
        if (!updatedItem) {
          throw new Error("CONFLICT");
        }
        await tx.equipmentAuditLog.create({
          data: {
            actor: student.studentId,
            action: "kiosk-return",
            targetType: "EquipmentItem",
            targetId: item.id,
            metadata: { barcode, checkoutId: returned.id }
          }
        });

        results.push({ action: "return" as const, item: updatedItem, checkout: returned, student });
        continue;
      }
      const claimed = await tx.equipmentItem.updateMany({
        where: {
          id: item.id,
          archivedAt: null,
          checkedOut: false,
          OR: [{ onHoldForStudentId: null }, { onHoldForStudentId: student.id }]
        },
        data: {
          checkedOut: true,
          checkedOutById: student.id,
          checkedOutAt: now,
          onHoldForStudentId: null,
          holdRequestId: null
        }
      });
      if (claimed.count !== 1) {
        throw new Error("CONFLICT");
      }

      const checkout = await tx.equipmentCheckout.create({
        data: {
          studentIdRef: student.id,
          itemId: item.id,
          status: "CHECKED_OUT",
          checkoutAt: now,
          metadata
        }
      });
      const updatedItem = await tx.equipmentItem.findUnique({ where: { id: item.id } });
      if (!updatedItem) {
        throw new Error("CONFLICT");
      }
      await tx.equipmentAuditLog.create({
        data: {
          actor: student.studentId,
          action: "kiosk-checkout",
          targetType: "EquipmentItem",
          targetId: item.id,
          metadata: { barcode, checkoutId: checkout.id, clearHold: Boolean(decision.clearHold), ...metadata }
        }
      });

      results.push({ action: "checkout" as const, item: updatedItem, checkout, student });
    }
    return { results };
  });
}
