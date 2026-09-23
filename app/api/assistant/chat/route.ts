import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import {
  ASSISTANT_GLOBAL_USAGE,
  ASSISTANT_QUOTA_MESSAGE,
  assistantAudience,
  assistantUsageFor
} from "@/src/lib/assistant-access";
import { assistantToolLabel } from "@/src/lib/assistant-tool-labels";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { env } from "@/src/lib/env";
import { fail } from "@/src/lib/http";
import { applyUserDisplayNames, userDisplayName } from "@/src/lib/user-display";
import { getPlatformAccess, isPlatformSuperAdmin } from "@/src/lib/platform-admin";
import { limitByKey } from "@/src/lib/rate-limit";
import { runAssistantChat, sanitizeAssistantMessages } from "@/src/server/assistant-chat";

const payloadSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string()
    })
  )
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const audience = assistantAudience(access.role);
    const usage = assistantUsageFor(audience);

    const burst = limitByKey(`assistant:${userId}`, {
      max: usage.burstMax,
      windowMs: usage.burstWindowMs
    });
    const day = burst.allowed
      ? limitByKey(`assistant-day:${userId}`, {
          max: usage.dayMax,
          windowMs: ASSISTANT_GLOBAL_USAGE.dayWindowMs
        })
      : { allowed: false };
    const globalBurst = burst.allowed && day.allowed
      ? limitByKey("assistant:global", {
          max: ASSISTANT_GLOBAL_USAGE.burstMax,
          windowMs: ASSISTANT_GLOBAL_USAGE.burstWindowMs
        })
      : { allowed: false };
    const globalDay =
      burst.allowed && day.allowed && globalBurst.allowed
        ? limitByKey("assistant:global-day", {
            max: ASSISTANT_GLOBAL_USAGE.dayMax,
            windowMs: ASSISTANT_GLOBAL_USAGE.dayWindowMs
          })
        : { allowed: false };
    if (!burst.allowed || !day.allowed || !globalBurst.allowed || !globalDay.allowed) {
      return fail(ASSISTANT_QUOTA_MESSAGE, 429);
    }

    const geminiApiKey = env.GEMINI_API_KEY_CHAT;
    const groqApiKey = env.GROQ_API_KEY;
    if (!geminiApiKey && !groqApiKey) {
      return fail("Assistant is not configured yet. Add GEMINI_API_KEY_CHAT or GROQ_API_KEY.", 503);
    }

    const payload = payloadSchema.parse(await request.json());
    const messages = sanitizeAssistantMessages(payload.messages);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        try {
          const result = await runAssistantChat({
            geminiApiKey,
            groqApiKey,
            groqModel: env.GROQ_MODEL,
            messages,
            canMutate: isPlatformSuperAdmin(access.role),
            audience,
            actorUserId: userId,
            actorName: userDisplayName(user),
            onTool(name) {
              send({ type: "tool", label: assistantToolLabel(name) });
            }
          });
          send({ type: "done", data: applyUserDisplayNames(result) });
        } catch (error) {
          const mapped = handleRouteError(error);
          const body = (await mapped.json()) as { error?: { message?: string } };
          send({
            type: "error",
            message: body.error?.message ?? "Assistant is unavailable.",
            status: mapped.status
          });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
