import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";

export async function GET() {
  try {
    const items = await prisma.equipmentItem.findMany({
      where: {
        archivedAt: null,
        checkedOut: false,
        onHoldForStudentId: null
      },
      select: { id: true, name: true, barcode: true },
      orderBy: { name: "asc" }
    });
    return ok({ items });
  } catch (error) {
    return handleRouteError(error);
  }
}
