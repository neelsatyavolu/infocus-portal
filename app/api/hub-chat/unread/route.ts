import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { unreadHubChatCount } from "@/src/server/hub-chat";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    return ok({ unreadCount: await unreadHubChatCount(userId, user) });
  } catch (error) {
    return handleRouteError(error);
  }
}
