import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { tossError } from "@/src/lib/package-toss";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { saveFinalCutToss } from "@/src/server/final-cut-toss";

const bodySchema = z.object({
  rowId: z.string().min(1),
  toss: z.string()
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const payload = bodySchema.parse(await request.json());
    const problem = tossError(payload.toss);
    if (problem) return fail(problem, 400);
    await saveFinalCutToss({ rowId: payload.rowId, userId, role: access.role, toss: payload.toss });
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
