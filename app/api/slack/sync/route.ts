import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { syncSlackOnStart } from "@/src/server/slack-sync";

export async function POST() {
  try {
    await requireUserId();
    const result = await syncSlackOnStart();
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
