import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { okNoStore } from "@/src/lib/http";
import { accessFromAppointments, appointedAreas, managerAreas } from "@/src/lib/managers";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { loadManagerRosters } from "@/src/server/manager-rosters";

/** The Managers tab as JSON (iPhone app): same data and access as app/(app)/managers/page.tsx. */
export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const [access, rosters] = await Promise.all([getPlatformAccess(user.email), loadManagerRosters()]);
    const isProducer = access.canManageWorkspaces;
    const yourAreas = appointedAreas(user.id, rosters);
    const areas = managerAreas(accessFromAppointments(isProducer, yourAreas)).map((area) => ({
      ...area,
      yours: yourAreas.includes(area.id),
      people: rosters[area.id]
    }));
    return okNoStore({ isProducer, yourAreas, areas });
  } catch (error) {
    return handleRouteError(error);
  }
}
