import { cookies } from "next/headers";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { fail, ok } from "@/src/lib/http";
import { LIVESTREAM_PIN_COOKIE_NAME, isLivestreamPin } from "@/src/lib/livestream-pin";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { livestreamPinCookieOptions, unlockLivestreamDashboard } from "@/src/server/livestream-pin";

const bodySchema = z.object({ pin: z.string() });

const MESSAGES: Record<string, [string, number]> = {
  FORBIDDEN: ["That PIN is not right.", 401],
  NOT_FOUND: ["The livestream PIN is not set up yet. A producer can create one in Settings.", 404],
  TOO_MANY_REQUESTS: ["Too many tries. Wait a few minutes.", 429],
  BAD_REQUEST: ["Enter the 6-digit PIN.", 400]
};

export async function POST(request: Request) {
  try {
    const limit = limitByKey(getRequestKey(request, "livestream-pin"), { max: 12, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) return fail("Too many tries. Wait a few minutes.", 429);

    const body = bodySchema.parse(await request.json());
    if (!isLivestreamPin(body.pin)) return fail("Enter the 6-digit PIN.", 400);

    const token = await unlockLivestreamDashboard(body.pin);
    const store = await cookies();
    store.set(LIVESTREAM_PIN_COOKIE_NAME, token, livestreamPinCookieOptions());
    return ok({ unlocked: true });
  } catch (error) {
    const known = error instanceof Error ? MESSAGES[error.message] : undefined;
    if (known) return fail(known[0], known[1]);
    return handleRouteError(error);
  }
}
