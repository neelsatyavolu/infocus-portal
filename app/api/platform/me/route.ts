import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    return ok({
      email: user.email,
      role: access.role,
      permissions: {
        canManageWorkspaces: access.canManageWorkspaces,
        canManageAllowedEmails: access.canManageAllowedEmails,
        canManagePlatformRoles: access.canManagePlatformRoles,
        isExecutiveProducer: access.isExecutiveProducer
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
