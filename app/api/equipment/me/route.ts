import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { canManageEquipment } from "@/src/server/equipment-access";

export async function GET() {
  try {
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        return ok({ signedIn: false, canManage: false });
      }
      throw error;
    }

    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const canManage = await canManageEquipment(user.id, access.role);
    return ok({ signedIn: true, canManage });
  } catch (error) {
    return handleRouteError(error);
  }
}
