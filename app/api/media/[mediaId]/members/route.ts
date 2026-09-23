import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { canManageProjectMedia } from "@/src/lib/rbac";
import { labeledUser } from "@/src/lib/user-display";
import { recomputeForMediaItem } from "@/src/server/cycle-cut-status";
import { requireMediaAccess } from "@/src/server/memberships";
import { listWorkspaceAccessUsers } from "@/src/server/workspace-access";

const updateMembersSchema = z.object({
  memberIds: z.array(z.string()).max(30)
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params;
    const payload = updateMembersSchema.parse(await request.json());
    const { userId, media, membership } = await requireMediaAccess(mediaId, undefined, { allowVisibility: true });
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!canManageProjectMedia(membership.role, access.role)) {
      throw new Error("FORBIDDEN");
    }

    const uniqueMemberIds = [...new Set(payload.memberIds.map((memberId) => memberId.trim()).filter(Boolean))];
    const assignableUserIds = new Set(
      uniqueMemberIds.length
        ? (await listWorkspaceAccessUsers(media.project.workspaceId)).map((user) => user.id)
        : []
    );
    const allowedMemberIds = uniqueMemberIds.filter((memberId) => assignableUserIds.has(memberId));

    if (allowedMemberIds.length !== uniqueMemberIds.length) {
      throw new Error("FORBIDDEN");
    }

    if (allowedMemberIds.length === 0) {
      await prisma.mediaItemAssignment.deleteMany({
        where: {
          mediaItemId: media.id
        }
      });
    } else {
      await prisma.mediaItemAssignment.deleteMany({
        where: {
          mediaItemId: media.id,
          userId: {
            notIn: allowedMemberIds
          }
        }
      });

      await prisma.mediaItemAssignment.createMany({
        data: allowedMemberIds.map((userId) => ({
          mediaItemId: media.id,
          userId
        })),
        skipDuplicates: true
      });
    }

    const assignedMembers = await prisma.mediaItemAssignment.findMany({
      where: {
        mediaItemId: media.id
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            nickname: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    await recomputeForMediaItem(media.id);

    return ok({
      assignedMembers: assignedMembers.map((assignment) => ({
        userId: assignment.user.id,
        ...labeledUser(assignment.user)
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
