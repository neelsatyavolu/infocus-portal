import { handleRouteError } from "@/src/lib/api-errors";
import { isAppReviewEmail } from "@/src/lib/app-review";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { okUnmapped } from "@/src/lib/http";
import { buildPlatformAccess, getPlatformRoleForEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { getDashboardData, loadStudentDashboardSnapshot } from "@/src/server/dashboard-data";
import { buildWorkspaceAccessWhere } from "@/src/server/workspace-access";

/**
 * The dashboard as JSON for the InFocus Portal iPhone app's Home tab: Up next (the signed-in
 * member's package this cycle), recent activity, the student grade snapshot, and the visible
 * workspaces with their projects. Same loaders and rules as app/(app)/dashboard/page.tsx;
 * the App Review account gets its own workspace's projects and no snapshot.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const platformRole = await getPlatformRoleForEmail(user.email);
    const isStudent = !buildPlatformAccess(platformRole).canManageWorkspaces && !isAppReviewEmail(user.email);
    const workspaces = await prisma.workspace.findMany({
      where: buildWorkspaceAccessWhere({ userId, platformRole, email: user.email }),
      select: {
        id: true,
        name: true,
        projects: {
          orderBy: { updatedAt: "desc" },
          select: { id: true, name: true, updatedAt: true, _count: { select: { mediaItems: true } } }
        }
      },
      orderBy: { name: "asc" }
    });
    const [panels, snapshot] = await Promise.all([
      getDashboardData({
        userId,
        userName: userDisplayName(user) || user.name,
        userEmail: user.email,
        workspaceIds: workspaces.map((workspace) => workspace.id)
      }),
      // platformRole came from this user's stored email, the same lookup the grade summary does.
      isStudent ? loadStudentDashboardSnapshot(userId, { platformRole }) : Promise.resolve(null)
    ]);
    return okUnmapped({
      ...panels,
      snapshot,
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        projects: workspace.projects.map((project) => ({
          id: project.id,
          name: project.name,
          updatedAt: project.updatedAt.toISOString(),
          mediaCount: project._count.mediaItems
        }))
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
