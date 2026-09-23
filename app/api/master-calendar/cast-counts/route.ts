import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { loadAnchorPaCounts } from "@/src/server/master-calendar-data";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "EXECUTIVE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    return ok(await loadAnchorPaCounts());
  } catch (error) {
    return handleRouteError(error);
  }
}
