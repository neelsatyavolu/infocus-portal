import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { canAppointEquipmentManagers, requireEquipmentManagerAccess } from "@/src/server/equipment-access";

const bodySchema = z.object({
  userId: z.string().min(1)
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    await requireEquipmentManagerAccess(user.id, access.role);

    const managers = await prisma.equipmentManager.findMany({
      include: { user: { select: { id: true, name: true, nickname: true, email: true } } },
      orderBy: { createdAt: "asc" }
    });

    return ok({
      managers: managers.map((row) => ({
        id: row.id,
        userId: row.userId,
        user: row.user,
        createdAt: row.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!canAppointEquipmentManagers(access.role)) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(getRequestKey(request, "equipment:managers:add"), {
      max: 40,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const body = bodySchema.parse(await request.json());
    const target = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, name: true, nickname: true, email: true }
    });
    if (!target) {
      return fail("User not found.", 404);
    }

    const row = await prisma.equipmentManager.upsert({
      where: { userId: target.id },
      create: { userId: target.id, createdByUserId: user.id },
      update: {},
      include: { user: { select: { id: true, name: true, nickname: true, email: true } } }
    });

    return ok(
      {
        id: row.id,
        userId: row.userId,
        user: row.user,
        createdAt: row.createdAt.toISOString()
      },
      201
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!canAppointEquipmentManagers(access.role)) {
      throw new Error("FORBIDDEN");
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");
    if (!targetUserId) {
      return fail("userId is required.", 400);
    }

    await prisma.equipmentManager.deleteMany({ where: { userId: targetUserId } });

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
