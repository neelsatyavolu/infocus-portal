import { isCronRequest } from "@/src/lib/cron-auth";
import { fail, okNoStore } from "@/src/lib/http";
import { runRuntimeChecks } from "@/src/server/runtime-check";

export const maxDuration = 60;

/** Host self-check for the move to Cloudflare Workers (Bearer CRON_SECRET). Remove once Vercel is retired. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return fail("Unauthorized", 401);
  return okNoStore(await runRuntimeChecks());
}
