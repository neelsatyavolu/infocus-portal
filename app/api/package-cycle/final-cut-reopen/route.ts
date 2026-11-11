import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { reopenFinalCut } from "@/src/server/final-cut-reopen";

const bodySchema = z.object({ rowId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const payload = bodySchema.parse(await request.json());
    await reopenFinalCut({ rowId: payload.rowId, role: access.role });
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
