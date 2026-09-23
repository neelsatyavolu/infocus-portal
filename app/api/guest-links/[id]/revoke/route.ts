import { WorkspaceRole } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    await syncUserProfile(userId);

    const link = await prisma.guestLink.findUnique({
      where: { id },
      include: {
        project: true,
        mediaVersion: {
          include: {
            mediaItem: {
              include: {
                project: true
              }
            }
          }
        }
      }
    });

    if (!link) {
      throw new Error("NOT_FOUND");
    }

    const workspaceId = link.project?.workspaceId ?? link.mediaVersion?.mediaItem.project.workspaceId;

    if (!workspaceId) {
      throw new Error("BAD_REQUEST");
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId
        }
      }
    });

    if (!membership || membership.role !== WorkspaceRole.OWNER_ADMIN) {
      throw new Error("FORBIDDEN");
    }

    const revoked = await prisma.guestLink.update({
      where: { id },
      data: {
        revokedAt: new Date()
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId,
        projectId: link.projectId ?? link.mediaVersion?.mediaItem.projectId,
        mediaVersionId: link.mediaVersionId,
        guestLinkId: link.id,
        actorId: userId,
        type: "guest_link.revoked"
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        projectId: link.projectId ?? link.mediaVersion?.mediaItem.projectId,
        mediaVersionId: link.mediaVersionId,
        guestLinkId: link.id,
        actorId: userId,
        action: "guest_link.revoke",
        targetType: "GuestLink",
        targetId: link.id
      }
    });

    return ok(revoked);
  } catch (error) {
    return handleRouteError(error);
  }
}
