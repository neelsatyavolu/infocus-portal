import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, isPlatformSuperAdmin } from "@/src/lib/platform-admin";
import { limitByKey } from "@/src/lib/rate-limit";
import { userDisplayName } from "@/src/lib/user-display";
import { executeAssistantAction } from "@/src/server/assistant-actions";

const payloadSchema = z.object({
  token: z.string().min(1)
});

function getAppBaseUrl(request: Request) {
  const configured = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  return configured || new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!isPlatformSuperAdmin(access.role)) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(`assistant-action:${userId}`, { max: 20, windowMs: 10 * 60 * 1000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = payloadSchema.parse(await request.json());
    const result = await executeAssistantAction({
      actorUserId: userId,
      actorEmail: user.email,
      token: payload.token,
      appBaseUrl: getAppBaseUrl(request),
      inviterName: userDisplayName(user) || user.email || "An InFocus producer"
    });

    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
