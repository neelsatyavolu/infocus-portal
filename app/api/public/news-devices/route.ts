import { ZodError } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { fail, ok } from "@/src/lib/http";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { newsDeviceDeleteSchema, newsDeviceSchema, registerNewsDevice, removeNewsDevice } from "@/src/server/news-devices";

const RATE = { max: 30, windowMs: 60 * 60 * 1000 };

function routeError(error: unknown) {
  if (error instanceof ZodError) return fail(error.issues[0]?.message ?? "Invalid request.", 400);
  return handleRouteError(error);
}

/** Public InFocus app: which alerts this iPhone wants (new shows, new stories, going live). */
export async function POST(request: Request) {
  try {
    if (!limitByKey(getRequestKey(request, "news-devices"), RATE).allowed) throw new Error("TOO_MANY_REQUESTS");
    await registerNewsDevice(newsDeviceSchema.parse(await request.json().catch(() => null)));
    return ok({ registered: true }, 201);
  } catch (error) {
    return routeError(error);
  }
}

/** Public InFocus app: every alert turned off. */
export async function DELETE(request: Request) {
  try {
    if (!limitByKey(getRequestKey(request, "news-devices"), RATE).allowed) throw new Error("TOO_MANY_REQUESTS");
    const { token } = newsDeviceDeleteSchema.parse(await request.json().catch(() => null));
    return ok({ removed: (await removeNewsDevice(token)) > 0 });
  } catch (error) {
    return routeError(error);
  }
}
