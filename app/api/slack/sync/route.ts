import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { syncSlackOnStart } from "@/src/server/slack-sync";

export async function POST() {
  try {
    await syncUserProfile(await requireUserId());
    const result = await syncSlackOnStart();
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
