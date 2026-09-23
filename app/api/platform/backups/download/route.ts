import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, isPlatformSuperAdmin } from "@/src/lib/platform-admin";
import { isHubBackupDumpKey } from "@/src/server/hub-backup";
import { createR2Store } from "@/src/server/hub-backup-r2";
import { currentR2Config } from "@/src/server/hub-backup-run";

const querySchema = z.object({
  key: z.string().min(1)
});

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!isPlatformSuperAdmin(access.role)) {
      throw new Error("FORBIDDEN");
    }

    const config = currentR2Config();
    if (!config) {
      return fail("Backups are not configured.", 400);
    }

    const url = new URL(request.url);
    const { key } = querySchema.parse({ key: url.searchParams.get("key") ?? "" });
    if (!isHubBackupDumpKey(key)) {
      throw new Error("BAD_REQUEST");
    }

    const expiresIn = 5 * 60;
    const signed = await createR2Store(config).signedUrl(key, expiresIn);
    return ok({ url: signed, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() });
  } catch (error) {
    return handleRouteError(error);
  }
}
