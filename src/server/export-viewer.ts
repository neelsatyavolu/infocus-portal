import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";

/** The signed-in person and their platform role, for CSV export routes to check access with. */
export async function loadExportViewer() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  return { userId: user.id, role: access.role };
}
