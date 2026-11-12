import { REQUEST_WINDOW_MESSAGES, validateRequestWindow } from "@/src/lib/equipment-request-window";
import { canApproveRequest, canDenyRequest } from "@/src/lib/equipment-requests";
import { prisma } from "@/src/lib/prisma";
import { sendEquipmentDecisionEmail, sendEquipmentRequestEmails } from "@/src/server/equipment-mail";
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
  /** Planned pickup and return (both or neither). */
  pickupAt?: Date | null;
  returnAt?: Date | null;
  now?: Date;
}) {
  const studentName = input.studentName.trim();
  const studentId = input.studentId.trim();
  const email = input.email.trim();
  const barcodes = [...new Set(input.barcodes.map((code) => code.trim()).filter(Boolean))];

  if (!studentName || !studentId || !email || barcodes.length === 0) {
    throw new Error("BAD_REQUEST");
  }

  const pickupAt = input.pickupAt ?? null;
  const returnAt = input.returnAt ?? null;
  if ((pickupAt === null) !== (returnAt === null)) {
    throw new Error("Give both a pickup and a return time.");
  }
  if (pickupAt && returnAt) {
    const windowError = validateRequestWindow({ pickupAt, returnAt, now: input.now });
    if (windowError) throw new Error(REQUEST_WINDOW_MESSAGES[windowError]);
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
      pickupAt,
      returnAt,
      items: {
        create: items.map((item) => ({ itemId: item.id }))
      }
    },
    // Anonymous callers get an acknowledgement only, never the student record.
    select: { id: true, status: true }
  });

  try {
    await sendEquipmentRequestEmails({
      studentName: student.name?.trim() || studentName,
      studentId: student.studentId,
      email,
      items: items.map((item) => ({ name: item.name, barcode: item.barcode })),
      pickupAt,
      returnAt
    });
  } catch (error) {
    console.error("Equipment request email failed", error);
  }

  return request;
}

type DecidedRequest = {
  id: string;
  email: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  pickupAt: Date | null;
  returnAt: Date | null;
  student: { name: string | null } | null;
  items: Array<{ deniedReason: string | null; item: { name: string; barcode: string } }>;
};

/** Tells the requester the outcome. A mail failure never undoes the decision. */
async function notifyRequester(request: DecidedRequest) {
  if (request.status === "PENDING") return;
  try {
    await sendEquipmentDecisionEmail({
      requestId: request.id,
      email: request.email,
      studentName: request.student?.name ?? null,
      decision: request.status,
      pickupAt: request.pickupAt,
      returnAt: request.returnAt,
      items: request.items.map((entry) => ({
        name: entry.item.name,
        barcode: entry.item.barcode,
        reason: entry.deniedReason
      }))
    });
  } catch (error) {
    console.error("Equipment decision email failed", error);
  }
}

export async function approveRequest(requestId: string) {
  const updated = await prisma.$transaction(async (tx) => {
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
  await notifyRequester(updated);
  return updated;
}

/**
 * Denies the whole request. `reason` applies to every item; `itemReasons` (keyed by request item
 * id) overrides it per item. Both are optional and are sent to the requester.
 */
export async function denyRequest(
  requestId: string,
  options: { reason?: string | null; itemReasons?: Record<string, string> } = {}
) {
  const fallbackReason = options.reason?.trim() || null;
  const updated = await prisma.$transaction(async (tx) => {
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

    for (const entry of request.items) {
      const reason = options.itemReasons?.[entry.id]?.trim() || fallbackReason;
      await tx.equipmentRequestItem.update({
        where: { id: entry.id },
        data: { denied: true, approved: false, deniedReason: reason }
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
        metadata: { remainingHolds, anyCheckedOut, reason: fallbackReason }
      }
    });

    return updated;
  });
  await notifyRequester(updated);
  return updated;
}
