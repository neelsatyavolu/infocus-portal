import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { isCronRequest } from "@/src/lib/cron-auth";
import { fail, ok } from "@/src/lib/http";
import { dueShowPublicationIds, runShowPublication } from "@/src/server/show-publishing-worker";
import { enqueueShowUploads } from "@/src/server/show-upload-queue";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.string().min(1).max(64).optional() });

/**
 * Show → YouTube uploads (Bearer CRON_SECRET; public in middleware). Called in-process by worker.ts:
 * with `{ id }` from the infocus-show-uploads queue consumer to run that show; with `{}` from the
 * every-minute cron to queue active shows no run is working on.
 */
export async function POST(request: Request) {
  try {
    if (!isCronRequest(request)) return fail("Unauthorized", 401);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return fail("Invalid request", 400);
    if (parsed.data.id) return ok(await runShowPublication(parsed.data.id));
    const ids = await dueShowPublicationIds();
    await enqueueShowUploads(ids);
    return ok({ queued: ids.length });
  } catch (error) {
    return handleRouteError(error);
  }
}
