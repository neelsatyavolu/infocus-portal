import { canApproveRequest, canDenyRequest } from "@/src/lib/equipment-requests";
import { prisma } from "@/src/lib/prisma";
import { sendEquipmentRequestEmails } from "@/src/server/equipment-mail";
import { lookupEquipmentStudent } from "@/src/server/equipment-students";

function isItemAvailable(item: {
  archivedAt: Date | null;
  checkedOut: boolean;
  onHoldForStudentId: string | null;
}) {
  return !item.archivedAt && !item.checkedOut && item.onHoldForStudentId == null;
}

export async function createPublicRequest(input: {
  studentName: string;
  studentId: string;
  email: string;
  barcodes: string[];
}) {
  const studentName = input.studentName.trim();
  const studentId = input.studentId.trim();
  const email = input.email.trim();
  const barcodes = [...new Set(input.barcodes.map((code) => code.trim()).filter(Boolean))];

  if (!studentName || !studentId || !email || barcodes.length === 0) {
    throw new Error("BAD_REQUEST");
  }

  let student = await lookupEquipmentStudent(studentId);
  if (!student) {
    throw new Error("NOT_FOUND");
  }

  if (!student.name?.trim()) {
    student = await prisma.equipmentStudent.update({
      where: { id: student.id },
      data: { name: studentName }
    });
  }

  const items = await prisma.equipmentItem.findMany({
    where: { barcode: { in: barcodes } }
  });
  if (items.length !== barcodes.length) {
    throw new Error("NOT_FOUND");
  }
  if (items.some((item) => item.archivedAt)) {
    throw new Error("NOT_FOUND");
  }
  if (!items.every(isItemAvailable)) {
    throw new Error("CONFLICT");
  }

  const request = await prisma.equipmentRequest.create({
    data: {
      studentIdRef: student.id,
      email,
      status: "PENDING",
      items: {
        create: items.map((item) => ({ itemId: item.id }))
      }
    },
    include: {
      student: true,
      items: { include: { item: true } }
    }
  });

  try {
    await sendEquipmentRequestEmails({
      studentName: student.name?.trim() || studentName,
      studentId: student.studentId,
      email,
      items: items.map((item) => ({ name: item.name, barcode: item.barcode }))
    });
  } catch (error) {
    console.error("Equipment request email failed", error);
  }

  return request;
}

export async function approveRequest(requestId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.equipmentRequest.findUnique({
      where: { id: requestId },
      include: { items: { include: { item: true } } }
    });
    if (!request) {
      throw new Error("NOT_FOUND");
    }

    const items = request.items.map((entry) => entry.item);
    if (!canApproveRequest({ status: request.status, items })) {
      throw new Error("CONFLICT");
    }

    const itemIds = items.map((item) => item.id);
    const held = await tx.equipmentItem.updateMany({
      where: {
        id: { in: itemIds },
        archivedAt: null,
        checkedOut: false,
        onHoldForStudentId: null
      },
      data: {
        onHoldForStudentId: request.studentIdRef,
        holdRequestId: request.id
      }
    });
    if (held.count !== itemIds.length) {
      throw new Error("CONFLICT");
    }

    const updated = await tx.equipmentRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", processedAt: new Date() },
      include: {
        student: true,
        items: { include: { item: true } }
      }
    });
    await tx.equipmentAuditLog.create({
      data: {
        action: "approve-request",
        targetType: "EquipmentRequest",
        targetId: request.id,
        metadata: { itemIds: items.map((item) => item.id) }
      }
    });

    return updated;
  });
}

export async function denyRequest(requestId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.equipmentRequest.findUnique({
      where: { id: requestId },
      include: { items: { include: { item: true } } }
    });
    if (!request) {
      throw new Error("NOT_FOUND");
    }

    const remainingHolds = request.items.filter((entry) => entry.item.holdRequestId === request.id).length;
    const anyCheckedOut = request.items.some((entry) => entry.item.checkedOut);
    if (
      !canDenyRequest({
        status: request.status,
        items: request.items.map((entry) => entry.item),
        anyCheckedOut,
        remainingHolds
      })
    ) {
      throw new Error("CONFLICT");
    }

    if (request.status === "APPROVED") {
      await tx.equipmentItem.updateMany({
        where: { holdRequestId: request.id },
        data: { onHoldForStudentId: null, holdRequestId: null }
      });
    }

    const updated = await tx.equipmentRequest.update({
      where: { id: request.id },
      data: { status: "DENIED", processedAt: new Date() },
      include: {
        student: true,
        items: { include: { item: true } }
      }
    });
    await tx.equipmentAuditLog.create({
      data: {
        action: "deny-request",
        targetType: "EquipmentRequest",
        targetId: request.id,
        metadata: { remainingHolds, anyCheckedOut }
      }
    });

    return updated;
  });
}
