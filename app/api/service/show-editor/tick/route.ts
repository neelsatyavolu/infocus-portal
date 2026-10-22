import { handleRouteError } from "@/src/lib/api-errors";
import { isCronRequest } from "@/src/lib/cron-auth";
import { fail, ok } from "@/src/lib/http";
import { runShowEditEscalations } from "@/src/server/show-editor-escalation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Approval escalation and the 8 AM auto-schedule (Bearer CRON_SECRET; public in middleware with the rest of
 * /api/service/show-editor). Called in-process every minute by the Portal Worker's cron (worker.ts).
 */
export async function POST(request: Request) {
  try {
    if (!isCronRequest(request)) return fail("Unauthorized", 401);
    return ok(await runShowEditEscalations());
  } catch (error) {
    return handleRouteError(error);
  }
}
