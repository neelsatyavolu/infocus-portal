import { handleRouteError } from "@/src/lib/api-errors";
import { isAppReviewEmail } from "@/src/lib/app-review";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { emptyNavStatus, loadNavStatus, parseNavStatusParts } from "@/src/server/nav-status";

/**
 * Sidebar statuses for the signed-in person (or the person being viewed as): unread feedback,
 * stage status and due date, needs-you counts, live meetings, new grades. Read-only; every part
 * is gated by role inside loadNavStatus. `?parts=package,extensions` loads only those parts.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const parts = parseNavStatusParts(new URL(request.url).searchParams.get("parts"));
    if (!parts) {
      return fail("Unknown status part.", 400);
    }
    // The App Review account only sees its sample workspace and Settings.
    if (isAppReviewEmail(user.email)) {
      return ok(emptyNavStatus(parts));
    }
    const access = await getPlatformAccess(user.email);
    return ok(await loadNavStatus({ userId: user.id, role: access.role }, parts));
  } catch (error) {
    return handleRouteError(error);
  }
}
