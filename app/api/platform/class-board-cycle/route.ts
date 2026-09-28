import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getClassBoardCycleNumber, setClassBoardCycleNumber } from "@/src/server/program-settings";

const payloadSchema = z.object({
  /** Null follows the current cycle. */
  cycleNumber: z.number().int().min(1).max(99).nullable()
});

async function requireAccess(minimum: "ASSOCIATE_PRODUCER" | "EXECUTIVE_PRODUCER") {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!hasPlatformRole(access.role, minimum)) throw new Error("FORBIDDEN");
  return access;
}

export async function GET() {
  try {
    const access = await requireAccess("ASSOCIATE_PRODUCER");
    const [cycleNumber, cycles] = await Promise.all([
      getClassBoardCycleNumber(),
      prisma.packageCycle.findMany({ orderBy: { cycleNumber: "asc" }, select: { cycleNumber: true, focus: true } })
    ]);
    return ok({ cycleNumber, cycles, canEdit: hasPlatformRole(access.role, "EXECUTIVE_PRODUCER") });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAccess("EXECUTIVE_PRODUCER");
    const payload = payloadSchema.parse(await request.json());
    const settings = await setClassBoardCycleNumber(payload.cycleNumber);
    return ok({ cycleNumber: settings.classBoardCycleNumber });
  } catch (error) {
    return handleRouteError(error);
  }
}
