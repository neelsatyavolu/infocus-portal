import { z } from "zod";
import { WorkspaceVisibility } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

const updateWorkspaceVisibilitySchema = z.object({
  visibility: z.nativeEnum(WorkspaceVisibility),
  specificMemberUserIds: z.array(z.string().cuid()).max(250).optional()
});

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageWorkspaces) {
      throw new Error("FORBIDDEN");
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true }
    });

    if (!workspace) {
      throw new Error("NOT_FOUND");
    }

    await prisma.workspace.delete({
      where: { id: workspaceId }
    });

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageWorkspaces) {
      throw new Error("FORBIDDEN");
    }

    const payload = updateWorkspaceVisibilitySchema.parse(await request.json());
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true }
    });

    if (!workspace) {
      throw new Error("NOT_FOUND");
    }

    const specificMemberUserIds = Array.from(new Set(payload.specificMemberUserIds ?? []));

    if (payload.visibility === WorkspaceVisibility.SPECIFIC_MEMBERS && specificMemberUserIds.length > 0) {
      const users = await prisma.user.findMany({
        where: {
          id: {
            in: specificMemberUserIds
          }
        },
        select: {
          id: true
        }
      });

      if (users.length !== specificMemberUserIds.length) {
        throw new Error("BAD_REQUEST");
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.workspace.update({
        where: {
          id: workspaceId
        },
        data: {
          visibility: payload.visibility
        }
      });

      await tx.workspaceVisibilityMember.deleteMany({
        where: {
          workspaceId
        }
      });

      if (payload.visibility === WorkspaceVisibility.SPECIFIC_MEMBERS && specificMemberUserIds.length > 0) {
        await tx.workspaceVisibilityMember.createMany({
          data: specificMemberUserIds.map((specificUserId) => ({
            workspaceId,
            userId: specificUserId
          })),
          skipDuplicates: true
        });
      }

      await tx.activityEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          type: "workspace.visibility.updated",
          payload: {
            visibility: payload.visibility,
            specificMemberCount:
              payload.visibility === WorkspaceVisibility.SPECIFIC_MEMBERS ? specificMemberUserIds.length : 0
          }
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          action: "workspace.visibility.update",
          targetType: "Workspace",
          targetId: workspaceId,
          metadata: {
            visibility: payload.visibility,
            specificMemberUserIds:
              payload.visibility === WorkspaceVisibility.SPECIFIC_MEMBERS ? specificMemberUserIds : []
          }
        }
      });
    });

    const updated = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        visibility: true,
        visibilityMembers: {
          select: {
            userId: true
          }
        }
      }
    });

    return ok({
      id: updated?.id,
      visibility: updated?.visibility,
      specificMemberUserIds: updated?.visibilityMembers.map((entry) => entry.userId) ?? []
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
