import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { requireEquipmentManagerAccess } from "@/src/server/equipment-access";
import { approveRequest, denyRequest } from "@/src/server/equipment-requests";

const bodySchema = z.object({
  id: z.string().min(1),
  action: z.enum(["approve", "deny"])
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
    const requests = await prisma.equipmentRequest.findMany({
      include: {
        student: { select: { id: true, name: true, studentId: true, email: true } },
        items: { include: { item: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    return ok({ requests });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireManager();
    const body = bodySchema.parse(await request.json());
    const updated = body.action === "approve" ? await approveRequest(body.id) : await denyRequest(body.id);
    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
