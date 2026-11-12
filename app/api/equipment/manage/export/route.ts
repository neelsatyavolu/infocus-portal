import { handleRouteError } from "@/src/lib/api-errors";
import { buildCsv, csvFilename, csvResponse } from "@/src/lib/csv";
import { prisma } from "@/src/lib/prisma";
import { requireEquipmentManagerAccess } from "@/src/server/equipment-access";
import { loadExportViewer } from "@/src/server/export-viewer";

type StudentRef = { name: string | null; email: string | null; studentId: string } | null;

function studentName(student: StudentRef) {
  return student?.name?.trim() || "";
}

function money(cents: number | null) {
  return cents === null ? null : (cents / 100).toFixed(2);
}

async function inventoryCsv() {
  const items = await prisma.equipmentItem.findMany({
    select: {
      name: true,
      barcode: true,
      retailValueCents: true,
      checkedOut: true,
      checkedOutAt: true,
      archivedAt: true,
      createdAt: true,
      checkedOutBy: { select: { name: true, email: true, studentId: true } },
      onHoldForStudent: { select: { name: true, email: true, studentId: true } },
      _count: { select: { checkouts: true } }
    },
    orderBy: [{ name: "asc" }, { barcode: "asc" }]
  });
  return buildCsv(
    [
      "Name",
      "Code",
      "Status",
      "Checked out by",
      "Borrower email",
      "Checked out at",
      "Held for",
      "Retail value ($)",
      "Times checked out",
      "Added",
      "Archived"
    ],
    items.map((item) => [
      item.name,
      item.barcode,
      item.archivedAt ? "Archived" : item.checkedOut ? "Out" : item.onHoldForStudent ? "On hold" : "In",
      studentName(item.checkedOutBy),
      item.checkedOutBy?.email ?? "",
      item.checkedOutAt?.toISOString() ?? "",
      studentName(item.onHoldForStudent),
      money(item.retailValueCents),
      item._count.checkouts,
      item.createdAt.toISOString(),
      item.archivedAt?.toISOString() ?? ""
    ])
  );
}

async function checkoutsCsv() {
  const checkouts = await prisma.equipmentCheckout.findMany({
    select: {
      status: true,
      checkoutAt: true,
      dueAt: true,
      returnAt: true,
      item: { select: { name: true, barcode: true } },
      student: { select: { name: true, email: true, studentId: true } }
    },
    orderBy: { checkoutAt: "desc" }
  });
  return buildCsv(
    ["Checked out at", "Item", "Code", "Borrower", "Borrower email", "Status", "Due", "Returned at"],
    checkouts.map((checkout) => [
      checkout.checkoutAt.toISOString(),
      checkout.item.name,
      checkout.item.barcode,
      studentName(checkout.student),
      checkout.student.email ?? "",
      checkout.status,
      checkout.dueAt?.toISOString() ?? "",
      checkout.returnAt?.toISOString() ?? ""
    ])
  );
}

/**
 * `?kind=inventory` (default): every item and where it is now. `?kind=checkouts`: the full checkout
 * history, newest first. Same access as Manage: producers (AP+) and appointed equipment managers.
 */
export async function GET(request: Request) {
  try {
    const { userId, role } = await loadExportViewer();
    await requireEquipmentManagerAccess(userId, role);

    const kind = new URL(request.url).searchParams.get("kind") ?? "inventory";
    if (kind !== "inventory" && kind !== "checkouts") {
      throw new Error("BAD_REQUEST");
    }

    return kind === "inventory"
      ? csvResponse(csvFilename("equipment-inventory"), await inventoryCsv())
      : csvResponse(csvFilename("equipment-checkouts"), await checkoutsCsv());
  } catch (error) {
    return handleRouteError(error);
  }
}
