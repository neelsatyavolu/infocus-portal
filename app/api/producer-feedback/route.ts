import { z } from "zod";
import { requireUserId } from "@/src/lib/auth";
import { handleRouteError } from "@/src/lib/api-errors";
import { fail, ok } from "@/src/lib/http";
import { limitByKey } from "@/src/lib/rate-limit";
import { PRODUCER_FEEDBACK_ENABLED, producerFeedbackSchema } from "@/src/lib/producer-feedback";
import { loadProducerFeedbackGroups, saveProducerFeedback } from "@/src/server/producer-feedback";

export async function GET() {
  try {
    const userId = await requireUserId();
    if (!PRODUCER_FEEDBACK_ENABLED) return fail("Producer feedback is temporarily unavailable.", 403);
    return ok({ groups: await loadProducerFeedbackGroups(userId) });
  }
  catch (error) { return handleRouteError(error); }
}
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    if (!PRODUCER_FEEDBACK_ENABLED) return fail("Producer feedback is temporarily unavailable.", 403);
    if (!limitByKey(`producer-feedback:${userId}`, { max: 10, windowMs: 60_000 }).allowed) throw new Error("TOO_MANY_REQUESTS");
    const payload = producerFeedbackSchema.extend({ rowId: z.string().min(1) }).parse(await request.json());
    await saveProducerFeedback(userId, payload.rowId, payload);
    return ok({ saved: true });
  } catch (error) { return handleRouteError(error); }
}
