import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, isPlatformSuperAdmin } from "@/src/lib/platform-admin";
import { createR2Store, readBackupListing } from "@/src/server/hub-backup-r2";
import { currentR2Config } from "@/src/server/hub-backup-run";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!isPlatformSuperAdmin(access.role)) {
      throw new Error("FORBIDDEN");
    }

    const config = currentR2Config();
    if (!config) {
      return ok({ configured: false as const });
    }

    const listing = await readBackupListing(createR2Store(config));
    return ok({ configured: true as const, ...listing });
  } catch (error) {
    return handleRouteError(error);
  }
}
