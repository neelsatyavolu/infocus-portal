import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { loadLivestreamsPayload } from "@/src/server/livestreams-payload";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    return ok(await loadLivestreamsPayload(user, access.role));
  } catch (error) {
    return handleRouteError(error);
  }
}
