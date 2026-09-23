import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

const RESET_CONFIRM_PHRASE = "RESET CYCLES";

const resetSchema = z.object({
  confirm: z.literal(RESET_CONFIRM_PHRASE)
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManagePlatformRoles) {
      throw new Error("FORBIDDEN");
    }

    const body = await request.json().catch(() => null);
    const parsed = resetSchema.safeParse(body);

    if (!parsed.success) {
      throw new Error("BAD_REQUEST");
    }

    const [historyEvents, grades, progressRows, cyclesCleared] = await prisma.$transaction([
      prisma.packageGradeHistoryEvent.deleteMany({}),
      prisma.packageGrade.deleteMany({}),
      prisma.packageProgressRow.deleteMany({}),
      prisma.packageCycle.updateMany({
        data: {
          focus: "",
          proofOfContactDate: null,
          aRollBRollDate: null,
          initialCutDate: null,
          finalCutDate: null
        }
      })
    ]);

    return ok({
      deleted: {
        historyEvents: historyEvents.count,
        grades: grades.count,
        progressRows: progressRows.count
      },
      cyclesCleared: cyclesCleared.count
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
