import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";

async function requireItem(id: string) {
  const item = await prisma.equipmentItem.findUnique({ where: { id } });
  if (!item) {
    throw new Error("NOT_FOUND");
  }
  return item;
}

function archivedCode(barcode: string) {
  return `${barcode} [archived ${randomUUID()}]`;
}

async function releaseArchivedCode(tx: Prisma.TransactionClient, barcode: string) {
  const existing = await tx.equipmentItem.findUnique({
    where: { barcode },
    select: { id: true, archivedAt: true }
  });
  if (!existing) return;
  if (!existing.archivedAt) throw new Error("CONFLICT");
  await tx.equipmentItem.update({
    where: { id: existing.id },
    data: { barcode: archivedCode(barcode) }
  });
}

export async function createItem(input: { name: string; barcode: string }) {
  return prisma.$transaction(async (tx) => {
    const name = input.name.trim();
    const barcode = input.barcode.trim();
    if (!name || !barcode) {
      throw new Error("BAD_REQUEST");
    }

    await releaseArchivedCode(tx, barcode);

    const item = await tx.equipmentItem.create({
      data: { name, barcode }
    });
    await tx.equipmentAuditLog.create({
      data: {
        action: "create-item",
        targetType: "EquipmentItem",
        targetId: item.id,
        metadata: { name, barcode }
      }
    });
    return item;
  });
}

export async function updateItem(input: { id: string; name?: string; barcode?: string }) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.equipmentItem.findUnique({ where: { id: input.id } });
    if (!item) throw new Error("NOT_FOUND");
    const data: { name?: string; barcode?: string } = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new Error("BAD_REQUEST");
      }
      data.name = name;
    }

    if (input.barcode !== undefined) {
      const barcode = input.barcode.trim();
      if (!barcode) {
        throw new Error("BAD_REQUEST");
      }
      if (barcode !== item.barcode) {
        await releaseArchivedCode(tx, barcode);
      }
      data.barcode = barcode;
    }

    const updated = Object.keys(data).length > 0
      ? await tx.equipmentItem.update({ where: { id: item.id }, data })
      : item;

    await tx.equipmentAuditLog.create({
      data: {
        action: "update-item",
        targetType: "EquipmentItem",
        targetId: item.id,
        metadata: data
      }
    });
    return updated;
  });
}

export async function archiveItem(id: string) {
  const item = await requireItem(id);
  if (item.archivedAt || item.checkedOut || item.onHoldForStudentId) {
    throw new Error("CONFLICT");
  }

  const archived = await prisma.equipmentItem.update({
    where: { id: item.id },
    data: { archivedAt: new Date(), barcode: archivedCode(item.barcode) }
  });
  await prisma.equipmentAuditLog.create({
    data: {
      action: "archive-item",
      targetType: "EquipmentItem",
      targetId: item.id,
      metadata: { barcode: item.barcode }
    }
  });
  return archived;
}

export async function forceReturn(itemId: string) {
  const item = await requireItem(itemId);
  if (!item.checkedOut) {
    throw new Error("BAD_REQUEST");
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const checkout = await tx.equipmentCheckout.findFirst({
      where: { itemId: item.id, status: "CHECKED_OUT" },
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
      where: { id: item.id, checkedOut: true },
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
        action: "force-return",
        targetType: "EquipmentItem",
        targetId: item.id,
        metadata: { barcode: item.barcode, checkoutId: returned.id }
      }
    });

    return { action: "return" as const, item: updatedItem, checkout: returned };
  });
}

export async function releaseHold(itemId: string) {
  const item = await requireItem(itemId);
  if (item.checkedOut) {
    throw new Error("CONFLICT");
  }

  const updated = await prisma.equipmentItem.update({
    where: { id: item.id },
    data: { onHoldForStudentId: null, holdRequestId: null }
  });
  await prisma.equipmentAuditLog.create({
    data: {
      action: "release-hold",
      targetType: "EquipmentItem",
      targetId: item.id,
      metadata: { barcode: item.barcode }
    }
  });
  return updated;
}
