import { isCronRequest } from "@/src/lib/cron-auth";
import { fail, okNoStore } from "@/src/lib/http";
import { runNewsAlerts } from "@/src/server/news-alerts";

export const maxDuration = 300;

/** Manual trigger (Bearer CRON_SECRET). The 10-minute schedule is the Inngest function news-alerts-every-ten-minutes. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return fail("Unauthorized", 401);
  return okNoStore(await runNewsAlerts());
}
