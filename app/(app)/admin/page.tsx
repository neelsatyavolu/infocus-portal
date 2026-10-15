import { unstable_rethrow } from "next/navigation";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { asApiJson } from "@/src/server/as-api-json";
import { listAccessRequests, listPlatformUsers, listRoleAssignments } from "@/src/server/platform-admin-lists";
import { getProgramSettings } from "@/src/server/program-settings";
import AdminClient from "./admin-client";
import type { AdminInitialData } from "./use-admin-data";

/**
 * Who you are (as GET /api/platform/me) and, for executive producers and up, the lists Admin opens
 * on (GET /api/platform/roles, /users, /access-requests, /program-settings), with the same checks,
 * so first paint needs no round trips. Totals, backups and settings load after hydration.
 */
async function loadInitialAdmin(): Promise<AdminInitialData | null> {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const me = {
      email: user.email,
      role: access.role,
      permissions: {
        canManageWorkspaces: access.canManageWorkspaces,
        canManageAllowedEmails: access.canManageAllowedEmails,
        canManagePlatformRoles: access.canManagePlatformRoles,
        isExecutiveProducer: access.isExecutiveProducer
      }
    };
    if (!access.canManageAllowedEmails) {
      return asApiJson({ me, roles: [], users: [], requests: [], cyclesPerSemester: 3 });
    }

    const [roles, users, requests, settings] = await Promise.all([
      listRoleAssignments(),
      listPlatformUsers(),
      listAccessRequests(),
      getProgramSettings()
    ]);
    // GET /api/platform/users sends names as stored (okUnmapped); the rest go through ok().
    const plainUsers = JSON.parse(JSON.stringify(users)) as AdminInitialData["users"];
    const mapped = asApiJson({ me, roles, requests, cyclesPerSemester: settings.cyclesPerSemester });
    // Prisma's role enum and Date fields arrive as the client's string types after the round trip.
    return { ...mapped, users: plainUsers } as unknown as AdminInitialData;
  } catch (error) {
    unstable_rethrow(error); // never swallow Next's dynamic-rendering signals
    // The client loads instead and shows the API's error message.
    console.error("Admin first-paint load failed", error);
    return null;
  }
}

export default async function AdminPage() {
  return <AdminClient initialData={await loadInitialAdmin()} />;
}
