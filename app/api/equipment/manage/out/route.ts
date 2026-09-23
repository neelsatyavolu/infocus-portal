import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { requireEquipmentManagerAccess } from "@/src/server/equipment-access";
import { forceReturn, releaseHold } from "@/src/server/equipment-inventory";

const patchSchema = z.object({
  action: z.enum(["force-return", "release-hold"]),
  itemId: z.string().min(1)
});

async function requireManager() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  await requireEquipmentManagerAccess(user.id, access.role);
}

export async function GET() {
  try {
    await requireManager();
    const items = await prisma.equipmentItem.findMany({
      where: {
        archivedAt: null,
        OR: [{ checkedOut: true }, { onHoldForStudentId: { not: null } }]
      },
      include: {
        checkouts: {
          where: { status: "CHECKED_OUT" },
          orderBy: { checkoutAt: "desc" },
          take: 1,
          select: { metadata: true }
        },
        checkedOutBy: { select: { id: true, name: true, studentId: true, email: true } },
        onHoldForStudent: { select: { id: true, name: true, studentId: true, email: true } }
      },
      orderBy: [{ checkedOutAt: "desc" }, { name: "asc" }]
    });
    return ok({ items: items.map(({ checkouts, ...item }) => {
      const metadata = checkouts[0]?.metadata;
      const tookSdCard = item.checkedOut && metadata && typeof metadata === "object" && !Array.isArray(metadata)
        && typeof metadata.tookSdCard === "boolean" ? metadata.tookSdCard : null;
      return { ...item, tookSdCard };
    }) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireManager();
    const body = patchSchema.parse(await request.json());
    if (body.action === "force-return") {
      return ok(await forceReturn(body.itemId));
    }
    return ok(await releaseHold(body.itemId));
  } catch (error) {
    return handleRouteError(error);
  }
}
