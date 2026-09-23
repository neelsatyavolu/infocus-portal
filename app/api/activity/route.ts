import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { requireProjectRole } from "@/src/server/memberships";
import { buildWorkspaceAccessWhere } from "@/src/server/workspace-access";
import { getPlatformAccess } from "@/src/lib/platform-admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (projectId) {
      await requireProjectRole(projectId, undefined, {
        allowVisibility: true
      });

      const events = await prisma.activityEvent.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 100
      });

      return ok(events);
    }

    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const workspaces = await prisma.workspace.findMany({
      where: buildWorkspaceAccessWhere({
        userId,
        platformRole: access.role
      }),
      select: {
        id: true
      }
    });

    const workspaceIds = workspaces.map((entry) => entry.id);

    const events = await prisma.activityEvent.findMany({
      where: {
        workspaceId: {
          in: workspaceIds
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return ok(events);
  } catch (error) {
    return handleRouteError(error);
  }
}
