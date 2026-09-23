import { cookies } from "next/headers";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { CLASS_BOARD_PIN_COOKIE_NAME, CLASS_BOARD_PIN_LENGTH } from "@/src/lib/class-board-pin";
import { fail, ok } from "@/src/lib/http";
import { limitByKey, getRequestKey } from "@/src/lib/rate-limit";
import { classBoardPinCookieOptions, unlockClassBoard } from "@/src/server/class-board-pin";

const bodySchema = z.object({
  pin: z.string()
});

export async function POST(request: Request) {
  try {
    const limit = limitByKey(getRequestKey(request, "class-board-pin"), { max: 12, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) {
      return fail("Too many tries. Wait a few minutes.", 429);
    }

    const body = bodySchema.parse(await request.json());
    if (!new RegExp(`^\\d{${CLASS_BOARD_PIN_LENGTH}}$`).test(body.pin)) {
      return fail("Enter the 6-digit PIN.", 400);
    }

    const token = await unlockClassBoard(body.pin);
    const store = await cookies();
    store.set(CLASS_BOARD_PIN_COOKIE_NAME, token, classBoardPinCookieOptions());
    return ok({ unlocked: true });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return fail("That PIN is not right.", 401);
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return fail("Class Board PIN is not set up yet.", 404);
    }
    if (error instanceof Error && error.message === "TOO_MANY_REQUESTS") {
      return fail("Too many tries. Wait a few minutes.", 429);
    }
    if (error instanceof Error && error.message === "BAD_REQUEST") {
      return fail("Enter the 6-digit PIN.", 400);
    }
    return handleRouteError(error);
  }
}
