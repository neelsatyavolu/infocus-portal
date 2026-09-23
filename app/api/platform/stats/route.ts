import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import {
  isCachedStorageEstimated,
  selectBackgroundStorageRefreshIds,
  sumCachedStorageBytes
} from "@/src/server/platform-stats";
import { refreshProjectStorageCache } from "@/src/server/storage-cache";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageAllowedEmails) {
      throw new Error("FORBIDDEN");
    }

    const [
      userCount,
      workspaceCount,
      projectCount,
      activeMediaCount,
      versionCount,
      commentCount,
      activeShareLinkCount,
      roleAssignmentCount,
      allowedEmailCount,
      projects,
      recentUsers
    ] = await Promise.all([
      prisma.user.count(),
      prisma.workspace.count(),
      prisma.project.count(),
      prisma.mediaItem.count({ where: { deletedAt: null } }),
      prisma.mediaVersion.count(),
      prisma.reviewComment.count(),
      prisma.guestLink.count({ where: { revokedAt: null } }),
      prisma.platformRoleAssignment.count(),
      prisma.allowedSignupEmail.count(),
      prisma.project.findMany({
        select: {
          id: true,
          storageBytes: true,
          storageUpdatedAt: true,
          _count: {
            select: {
              mediaItems: {
                where: {
                  deletedAt: null
                }
              }
            }
          }
        }
      }),
      prisma.user.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true
        }
      })
    ]);

    const refreshIds = selectBackgroundStorageRefreshIds(
      projects.map((project) => ({
        id: project.id,
        storageBytes: project.storageBytes,
        storageUpdatedAt: project.storageUpdatedAt,
        mediaItemCount: project._count.mediaItems
      }))
    );
    if (refreshIds.length > 0) {
      void Promise.all(refreshIds.map((projectId) => refreshProjectStorageCache(projectId))).catch(() => undefined);
    }

    return ok({
      totals: {
        users: userCount,
        workspaces: workspaceCount,
        projects: projectCount,
        activeMedia: activeMediaCount,
        versions: versionCount,
        comments: commentCount,
        activeShareLinks: activeShareLinkCount,
        roleAssignments: roleAssignmentCount,
        allowedEmails: allowedEmailCount
      },
      storage: {
        estimatedBytes: Math.max(0, Math.round(sumCachedStorageBytes(projects))),
        isEstimated: isCachedStorageEstimated(projects)
      },
      recentUsers
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
