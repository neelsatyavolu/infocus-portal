import { EQUIPMENT_OVERDUE_HOURS } from "@/src/lib/equipment-overdue";
import { prisma } from "@/src/lib/prisma";

/**
 * The signed-in person's gear, for the iPhone app: items they have out (with the time they
 * become overdue), items held for them by an approved request, and their recent requests.
 * Borrowers are equipment records, not Portal accounts, so they are matched by email.
 */

const HOUR_MS = 60 * 60 * 1000;
const RECENT_REQUESTS = 20;

export async function loadMyEquipment(email: string, now = new Date()) {
  const address = email.trim();
  if (!address) return { overdueAfterHours: EQUIPMENT_OVERDUE_HOURS, out: [], held: [], requests: [] };

  const students = await prisma.equipmentStudent.findMany({
    where: { email: { equals: address, mode: "insensitive" } },
    select: { id: true }
  });
  const studentIds = students.map((student) => student.id);
  const itemSelect = { id: true, name: true, barcode: true } as const;

  const [out, held, requests] = await Promise.all([
    studentIds.length
      ? prisma.equipmentItem.findMany({
          where: { archivedAt: null, checkedOut: true, checkedOutById: { in: studentIds } },
          select: { ...itemSelect, checkedOutAt: true },
          orderBy: { checkedOutAt: "asc" }
        })
      : Promise.resolve([]),
    studentIds.length
      ? prisma.equipmentItem.findMany({
          where: { archivedAt: null, checkedOut: false, onHoldForStudentId: { in: studentIds } },
          select: itemSelect,
          orderBy: { name: "asc" }
        })
      : Promise.resolve([]),
    prisma.equipmentRequest.findMany({
      where: {
        OR: [
          { email: { equals: address, mode: "insensitive" } },
          ...(studentIds.length ? [{ studentIdRef: { in: studentIds } }] : [])
        ]
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        items: { select: { item: { select: { ...itemSelect, checkedOut: true, checkedOutById: true } } } }
      },
      orderBy: { createdAt: "desc" },
      take: RECENT_REQUESTS
    })
  ]);

  const mine = new Set(studentIds);
  return {
    overdueAfterHours: EQUIPMENT_OVERDUE_HOURS,
    out: out.map((item) => {
      const dueAt = item.checkedOutAt ? new Date(item.checkedOutAt.getTime() + EQUIPMENT_OVERDUE_HOURS * HOUR_MS) : null;
      return {
        id: item.id,
        name: item.name,
        barcode: item.barcode,
        checkedOutAt: item.checkedOutAt?.toISOString() ?? null,
        dueAt: dueAt?.toISOString() ?? null,
        overdue: dueAt ? dueAt.getTime() <= now.getTime() : false
      };
    }),
    held,
    requests: requests.map((request) => ({
      id: request.id,
      status: request.status,
      // The web's "Fulfilled": approved, and every held item is now out with this borrower.
      fulfilled:
        request.status === "APPROVED" &&
        request.items.length > 0 &&
        request.items.every(({ item }) => item.checkedOut && item.checkedOutById !== null && mine.has(item.checkedOutById)),
      createdAt: request.createdAt.toISOString(),
      items: request.items.map(({ item }) => ({ id: item.id, name: item.name, barcode: item.barcode }))
    }))
  };
}
