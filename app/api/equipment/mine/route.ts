import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { loadMyEquipment } from "@/src/server/equipment-mine";

/** The InFocus iPhone app: gear the signed-in person has out or on hold, and their requests. */
export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    return ok(await loadMyEquipment(user.email ?? ""));
  } catch (error) {
    return handleRouteError(error);
  }
}
