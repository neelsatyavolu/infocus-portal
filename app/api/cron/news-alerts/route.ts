import { isCronRequest } from "@/src/lib/cron-auth";
import { fail, okNoStore } from "@/src/lib/http";
import { runNewsAlerts } from "@/src/server/news-alerts";

export const maxDuration = 300;

/** Every 10 minutes (vercel.json): alerts the public InFocus app about new shows, stories and live streams. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return fail("Unauthorized", 401);
  return okNoStore(await runNewsAlerts());
}
