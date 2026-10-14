import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { isCronRequest } from "@/src/lib/cron-auth";
import { fail, ok } from "@/src/lib/http";
import { runShowPublication } from "@/src/server/show-publishing-worker";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.string().min(1).max(64) });

/**
 * Runs one show → YouTube upload (Bearer CRON_SECRET; public in middleware). Called in-process by the
 * infocus-show-uploads queue consumer in worker.ts, which queues the next run after `nextInSeconds`.
 */
export async function POST(request: Request) {
  try {
    if (!isCronRequest(request)) return fail("Unauthorized", 401);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return fail("Invalid request", 400);
    return ok(await runShowPublication(parsed.data.id));
  } catch (error) {
    return handleRouteError(error);
  }
}
