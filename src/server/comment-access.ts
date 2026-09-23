import { WorkspaceRole } from "@prisma/client";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { associateReviewClosed } from "@/src/lib/package-approval";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { requireGuestLink } from "@/src/server/guest-access";
import { resolveWorkspaceAccess } from "@/src/server/workspace-access";

export async function getMediaVersionContext(mediaVersionId: string) {
  const mediaVersion = await prisma.mediaVersion.findUnique({
    where: { id: mediaVersionId },
    include: {
      mediaItem: {
        include: {
          project: true
        }
      }
    }
  });

  if (!mediaVersion) {
    throw new Error("NOT_FOUND");
  }

  return mediaVersion;
}

export async function requireCommentActor(mediaVersionId: string, guestToken?: string) {
  const mediaVersion = await getMediaVersionContext(mediaVersionId);

  if (guestToken) {
    const guest = await requireGuestLink(guestToken, {
      mediaVersionId,
      requireComment: true
    });

    return {
      actorType: "guest" as const,
      actorId: null,
      role: WorkspaceRole.REVIEWER,
      workspaceId: guest.workspaceId,
      projectId: guest.projectId,
      mediaVersion
    };
  }

  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const platform = await getPlatformAccess(user.email);
  if (await initialCutReviewClosed(mediaVersion.mediaItemId, userId, platform.role)) {
    throw new Error("FORBIDDEN");
  }
  const access = await resolveWorkspaceAccess({
    workspaceId: mediaVersion.mediaItem.project.workspaceId,
    userId,
    email: user.email,
    allowVisibility: true
  });

  return {
    actorType: "member" as const,
    actorId: userId,
    role: access.membership.role,
    workspaceId: mediaVersion.mediaItem.project.workspaceId,
    projectId: mediaVersion.mediaItem.projectId,
    mediaVersion
  };
}

/**
 * True when an associate producer (not on the roster) opens a package's
 * Initial Cut after it has left Stage 1. They may watch it but not review it.
 */
export async function initialCutReviewClosed(
  mediaItemId: string,
  userId: string,
  role: Parameters<typeof associateReviewClosed>[0]
) {
  if (role !== "ASSOCIATE_PRODUCER") return false;
  const row = await prisma.packageProgressRow.findFirst({
    where: { initialCutMediaItemId: mediaItemId },
    select: { approval: { select: { stage: true } }, members: { select: { userId: true } } }
  });
  if (!row || row.members.some((member) => member.userId === userId)) return false;
  return associateReviewClosed(role, row.approval?.stage);
}
