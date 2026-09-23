import { handleRouteError } from "@/src/lib/api-errors";
import { syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { canManageProjectMedia } from "@/src/lib/rbac";
import { recomputeForProjectName } from "@/src/server/cycle-cut-status";
import { requireProjectRole } from "@/src/server/memberships";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { userId, membership } = await requireProjectRole(projectId, undefined, { allowVisibility: true });
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!canManageProjectMedia(membership.role, access.role)) {
      throw new Error("FORBIDDEN");
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, workspaceId: true }
    });

    if (!project) {
      throw new Error("NOT_FOUND");
    }

    const now = new Date();

    const result = await prisma.mediaItem.updateMany({
      where: {
        projectId,
        deletedAt: null
      },
      data: {
        deletedAt: now,
        deletedById: userId
      }
    });

    if (result.count > 0) {
      await prisma.activityEvent.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          actorId: userId,
          type: "media.soft_deleted_bulk",
          payload: {
            count: result.count
          }
        }
      });

      await prisma.auditLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          actorId: userId,
          action: "media.soft_delete_bulk",
          targetType: "Project",
          targetId: project.id,
          metadata: {
            count: result.count
          }
        }
      });

      await recomputeForProjectName(project.name);
    }

    return ok({ deletedCount: result.count });
  } catch (error) {
    return handleRouteError(error);
  }
}
