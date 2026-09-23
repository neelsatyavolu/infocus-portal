import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { userDisplayName } from "@/src/lib/user-display";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import {
  decideParticipationGradeRequest,
  listParticipationGradeRequests
} from "@/src/server/participation-grade-requests";

const decisionSchema = z.object({
  requestId: z.string().min(1),
  approved: z.boolean()
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const payload = await listParticipationGradeRequests({
      id: user.id,
      email: user.email,
      name: userDisplayName(user) || user.name
    });
    return ok(payload);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);

    const rate = limitByKey(getRequestKey(request, "participation:review"), {
      max: 60,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = decisionSchema.parse(await request.json());
    const result = await decideParticipationGradeRequest(
      { id: user.id, email: user.email, name: userDisplayName(user) || user.name },
      payload
    );
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
