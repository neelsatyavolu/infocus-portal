import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { requireEquipmentManagerAccess } from "@/src/server/equipment-access";
import { archiveItem, createItem, updateItem } from "@/src/server/equipment-inventory";

const createSchema = z.object({
  name: z.string().trim().min(1),
  barcode: z.string().trim().min(1)
});

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  barcode: z.string().trim().min(1).optional(),
  archived: z.boolean().optional()
});

async function requireManager() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  await requireEquipmentManagerAccess(user.id, access.role);
  return { user, access };
}

export async function GET() {
  try {
    await requireManager();
    const items = await prisma.equipmentItem.findMany({
      where: { archivedAt: null },
      include: {
        checkedOutBy: { select: { id: true, name: true, studentId: true, email: true } },
        onHoldForStudent: { select: { id: true, name: true, studentId: true, email: true } }
      },
      orderBy: { name: "asc" }
    });
    return ok({ items });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireManager();
    const body = createSchema.parse(await request.json());
    const item = await createItem(body);
    return ok(item, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireManager();
    const body = patchSchema.parse(await request.json());
    if (body.archived === true) {
      const archived = await archiveItem(body.id);
      return ok(archived);
    }
    const item = await updateItem({ id: body.id, name: body.name, barcode: body.barcode });
    return ok(item);
  } catch (error) {
    return handleRouteError(error);
  }
}
