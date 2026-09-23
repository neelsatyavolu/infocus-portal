import { deleteBunnyVideo } from "@/src/lib/bunny";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { requireProjectRole } from "@/src/server/memberships";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    await requireProjectRole(projectId, undefined, {
      allowVisibility: true
    });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        workspace: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!project) {
      throw new Error("NOT_FOUND");
    }

    return ok(project);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageWorkspaces) {
      throw new Error("FORBIDDEN");
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true }
    });

    if (!project) {
      throw new Error("NOT_FOUND");
    }

    const mediaVersions = await prisma.mediaVersion.findMany({
      where: {
        mediaItem: {
          projectId
        }
      },
      select: {
        bunnyVideoId: true
      }
    });

    for (const version of mediaVersions) {
      await deleteBunnyVideo(version.bunnyVideoId);
    }

    await prisma.project.delete({
      where: { id: projectId }
    });

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
