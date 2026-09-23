import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { GRADE_WEIGHTS } from "@/src/lib/grading";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { buildGradeSummary } from "@/src/server/student-grade-summary";

/**
 * Weighted 2026-27 grade for the signed-in student, or for another student when
 * a producer passes ?userId=.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("userId");

    if (requestedUserId && requestedUserId !== userId) {
      if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
        throw new Error("FORBIDDEN");
      }
    }

    const summary = await buildGradeSummary(requestedUserId ?? userId);

    return ok({ weights: GRADE_WEIGHTS, ...summary });
  } catch (error) {
    return handleRouteError(error);
  }
}
