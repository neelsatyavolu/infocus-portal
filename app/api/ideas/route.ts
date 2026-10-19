import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getIdeaBatch, listIdeaRunDates } from "@/src/server/ideas";

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
});

/** Story ideas (/ideas page): the set for `date` (or the newest) and every set's date, newest first. */
export async function GET(request: Request) {
  try {
    await requireUserId();
    const parsed = querySchema.safeParse({
      date: new URL(request.url).searchParams.get("date") ?? undefined
    });
    if (!parsed.success) return fail("date must be YYYY-MM-DD", 400);
    const [batch, runDates] = await Promise.all([getIdeaBatch(parsed.data.date), listIdeaRunDates()]);
    return ok({ batch, runDates });
  } catch (error) {
    return handleRouteError(error);
  }
}
