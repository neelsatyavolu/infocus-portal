import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { limitByKey } from "@/src/lib/rate-limit";
import { getHubChatThread, sendHubChatMessage } from "@/src/server/hub-chat";

const sendSchema = z.object({
  body: z.string()
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const userId = await requireUserId();
    await syncUserProfile(userId);
    const { chatId } = await context.params;
    return ok(await getHubChatThread(userId, chatId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const userId = await requireUserId();
    await syncUserProfile(userId);
    const sendLimit = limitByKey(`hub-chat-send:${userId}`, { max: 30, windowMs: 60_000 });
    if (!sendLimit.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }
    const { chatId } = await context.params;
    const payload = sendSchema.parse(await request.json());
    return ok(await sendHubChatMessage(userId, chatId, payload.body));
  } catch (error) {
    return handleRouteError(error);
  }
}
