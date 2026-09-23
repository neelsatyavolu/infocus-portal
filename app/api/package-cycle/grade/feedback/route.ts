import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { MAX_CYCLE_GRADE_FEEDBACK } from "@/src/lib/package-cycle-grades";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { savePackageCycleGradeFeedback } from "@/src/server/package-cycle-stage";

const schema = z.object({
  rowId: z.string().min(1),
  feedback: z.string().max(MAX_CYCLE_GRADE_FEEDBACK)
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const payload = schema.parse(await request.json());
    const result = await savePackageCycleGradeFeedback({
      rowId: payload.rowId,
      role: access.role,
      feedback: payload.feedback
    });
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
