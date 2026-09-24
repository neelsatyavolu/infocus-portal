import { WorkspaceRole } from "@prisma/client";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformRoleForEmail, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { resolveWorkspaceAccess } from "@/src/server/workspace-access";

type AccessOptions = {
  allowVisibility?: boolean;
};

export async function requireProjectRole(
  projectId: string,
  allowedRoles?: WorkspaceRole[],
  options?: AccessOptions
) {
  const userId = await requireUserId();
  // findUnique resolves null (never throws) for a missing project, so auth errors keep precedence.
  const [user, project] = await Promise.all([
    syncUserProfile(userId),
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        workspaceId: true
      }
    })
  ]);

  if (!project) {
    throw new Error("NOT_FOUND");
  }

  const access = await resolveWorkspaceAccess({
    workspaceId: project.workspaceId,
    userId,
    email: user.email,
    allowVisibility: options?.allowVisibility
  });

  if (allowedRoles && !allowedRoles.includes(access.membership.role)) {
    throw new Error("FORBIDDEN");
  }

  return {
    userId,
    project,
    membership: access.membership,
    isDirectMember: access.isDirectMember
  };
}

export async function requireMediaAccess(
  mediaId: string,
  allowedRoles?: WorkspaceRole[],
  options?: AccessOptions
) {
  // Load the viewer alongside the media row; errors are rethrown below in the original order
  // (NOT_FOUND for a missing item first, then auth).
  const viewer = requireUserId()
    .then(async (userId) => ({ ok: true as const, userId, user: await syncUserProfile(userId) }))
    .catch((error: unknown) => ({ ok: false as const, error }));

  const media = await prisma.mediaItem.findUnique({
    where: { id: mediaId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          workspaceId: true
        }
      },
      folder: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!media) {
    throw new Error("NOT_FOUND");
  }

  const viewerResult = await viewer;
  if (!viewerResult.ok) {
    throw viewerResult.error;
  }
  const { userId, user } = viewerResult;

  let access: Awaited<ReturnType<typeof resolveWorkspaceAccess>>;
  try {
    access = await resolveWorkspaceAccess({
      workspaceId: media.project.workspaceId,
      userId,
      email: user.email,
      allowVisibility: options?.allowVisibility
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "FORBIDDEN" || !options?.allowVisibility) {
      throw error;
    }
    const cycleAccess = await resolveCycleMediaAccess({
      userId,
      email: user.email,
      mediaId,
      workspaceId: media.project.workspaceId
    });
    if (!cycleAccess) {
      throw error;
    }
    access = cycleAccess;
  }

  if (allowedRoles && !allowedRoles.includes(access.membership.role)) {
    throw new Error("FORBIDDEN");
  }

  return {
    userId,
    membership: access.membership,
    isDirectMember: access.isDirectMember,
    media
  };
}

async function resolveCycleMediaAccess(input: {
  userId: string;
  email: string | null;
  mediaId: string;
  workspaceId: string;
}) {
  const role = await getPlatformRoleForEmail(input.email);
  const isProducer = hasPlatformRole(role, "ASSOCIATE_PRODUCER");
  const row = await prisma.packageProgressRow.findFirst({
    where: {
      OR: [
        { stageMedia: { some: { mediaItemId: input.mediaId } } },
        { initialCutMediaItemId: input.mediaId },
        { finalCutMediaItemId: input.mediaId }
      ],
      ...(isProducer ? {} : { members: { some: { userId: input.userId } } })
    },
    select: { id: true }
  });
  if (!row) {
    return null;
  }
  return {
    membership: {
      id: `cycle-media:${input.mediaId}:${input.userId}`,
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: WorkspaceRole.REVIEWER,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    },
    isDirectMember: false
  };
}
