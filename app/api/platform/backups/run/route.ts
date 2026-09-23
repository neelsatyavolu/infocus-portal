import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { inngest } from "@/src/lib/inngest";
import { getPlatformAccess, isPlatformSuperAdmin } from "@/src/lib/platform-admin";
import { currentR2Config } from "@/src/server/hub-backup-run";

export async function POST() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!isPlatformSuperAdmin(access.role)) {
      throw new Error("FORBIDDEN");
    }

    if (!currentR2Config()) {
      return fail("Backups are not configured.", 400);
    }

    await inngest.send({ name: "hub/backup.requested" });
    return ok({ queued: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
