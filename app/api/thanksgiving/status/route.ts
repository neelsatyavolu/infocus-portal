import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { handleRouteError } from "@/src/lib/api-errors";
import { okUnmapped } from "@/src/lib/http";
import { inHarvestHour } from "@/src/lib/thanksgiving-harvest-hour";
import { harvestHour } from "@/src/server/thanksgiving-harvest-hour";

/**
 * Whether harvest hour is on right now (src/lib/thanksgiving-harvest-hour.ts). The hour is only
 * given out once it has started, so it stays a surprise. Browsers ask every minute during the
 * 4–8 PM window (components/thanksgiving/contest-countdown.tsx), so the only database work is
 * the account check.
 */
export async function GET() {
  try {
    await syncUserProfile(await requireUserId());
    const hour = harvestHour();
    const live = inHarvestHour(hour, Date.now());
    return okUnmapped({
      harvestHour: live ? { startsAt: hour.startsAt.toISOString(), endsAt: hour.endsAt.toISOString() } : null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
