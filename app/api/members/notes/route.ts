import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { MEMBER_NOTE_MAX } from "@/src/lib/member-notes";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { saveMemberProducerNote } from "@/src/server/member-notes";

const payloadSchema = z.object({
  userId: z.string().min(1),
  cycleNumber: z.number().int(),
  notes: z.string().max(MEMBER_NOTE_MAX)
});

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);

    const rate = limitByKey(getRequestKey(request, "members:notes"), {
      max: 120,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = payloadSchema.parse(await request.json());
    const saved = await saveMemberProducerNote({
      actorEmail: user.email,
      userId: payload.userId,
      cycleNumber: payload.cycleNumber,
      notes: payload.notes
    });

    return ok(saved);
  } catch (error) {
    return handleRouteError(error);
  }
}
