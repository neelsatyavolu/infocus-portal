import { PlatformRole, type Prisma, WorkspaceRole, WorkspaceVisibility } from "@prisma/client";
import { getPlatformRoleForEmail, hasPlatformRole, normalizeEmail, PLATFORM_SUPER_ADMIN_EMAIL } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";

export type WorkspaceAccessMembership = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkspaceAccessContext = {
  membership: WorkspaceAccessMembership;
  isDirectMember: boolean;
};

export type WorkspaceAccessUser = {
  id: string;
  name: string | null;
  email: string | null;
};

export function buildWorkspaceAccessWhere(params: {
  userId: string;
  platformRole: PlatformRole | null;
}): Prisma.WorkspaceWhereInput {
  const { userId, platformRole } = params;
  const visibilityScopes: Prisma.WorkspaceWhereInput[] = [
    {
      visibility: WorkspaceVisibility.ALL_MEMBERS
    },
    {
      visibility: WorkspaceVisibility.SPECIFIC_MEMBERS,
      visibilityMembers: {
        some: {
          userId
        }
      }
    }
  ];

  if (hasPlatformRole(platformRole, PlatformRole.ASSOCIATE_PRODUCER)) {
    visibilityScopes.push({ visibility: WorkspaceVisibility.MANAGERS_AND_ADMINS });
  }

  if (hasPlatformRole(platformRole, PlatformRole.EXECUTIVE_PRODUCER)) {
    visibilityScopes.push({ visibility: WorkspaceVisibility.ADMINS_ONLY });
  }

  return {
    OR: [
      {
        members: {
          some: {
            userId
          }
        }
      },
      ...visibilityScopes
    ]
  };
}

function hasVisibilityAccess(
  visibility: WorkspaceVisibility,
  specificMembership: boolean,
  platformRole: PlatformRole | null
) {
  if (visibility === WorkspaceVisibility.ALL_MEMBERS) {
    return true;
  }

  if (visibility === WorkspaceVisibility.MANAGERS_AND_ADMINS) {
    return hasPlatformRole(platformRole, PlatformRole.ASSOCIATE_PRODUCER);
  }

  if (visibility === WorkspaceVisibility.ADMINS_ONLY) {
    return hasPlatformRole(platformRole, PlatformRole.EXECUTIVE_PRODUCER);
  }

  if (visibility === WorkspaceVisibility.SPECIFIC_MEMBERS) {
    return specificMembership;
  }

  return false;
}

export async function resolveWorkspaceAccess(params: {
  workspaceId: string;
  userId: string;
  email?: string | null;
  allowVisibility?: boolean;
}): Promise<WorkspaceAccessContext> {
  const { workspaceId, userId, email, allowVisibility = false } = params;
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: workspaceId
    },
    select: {
      id: true,
      visibility: true,
      members: {
        where: {
          userId
        },
        take: 1,
        select: {
          id: true,
          workspaceId: true,
          userId: true,
          role: true,
          createdAt: true,
          updatedAt: true
        }
      },
      visibilityMembers: {
        where: {
          userId
        },
        select: {
          id: true
        },
        take: 1
      }
    }
  });

  if (!workspace) {
    throw new Error("NOT_FOUND");
  }

  const member = workspace.members[0];
  if (member) {
    return {
      membership: member,
      isDirectMember: true
    };
  }

  if (!allowVisibility) {
    throw new Error("FORBIDDEN");
  }

  const platformRole = await getPlatformRoleForEmail(email);
  const specificMembership = workspace.visibilityMembers.length > 0;

  if (!hasVisibilityAccess(workspace.visibility, specificMembership, platformRole)) {
    throw new Error("FORBIDDEN");
  }

  return {
    membership: {
      id: `visibility:${workspaceId}:${userId}`,
      workspaceId,
      userId,
      role: WorkspaceRole.REVIEWER,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    },
    isDirectMember: false
  };
}

export async function listWorkspaceAccessUsers(workspaceId: string): Promise<WorkspaceAccessUser[]> {
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: workspaceId
    },
    select: {
      visibility: true,
      members: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              nickname: true,
              email: true
            }
          }
        }
      },
      visibilityMembers: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              nickname: true,
              email: true
            }
          }
        }
      }
    }
  });

  if (!workspace) {
    throw new Error("NOT_FOUND");
  }

  const candidates = new Map<string, WorkspaceAccessUser>();

  function addUsers(users: Array<{ id: string; name: string | null; email: string | null; nickname?: string | null }>) {
    for (const user of users) {
      candidates.set(user.id, {
        id: user.id,
        name: userDisplayName(user) || user.name,
        email: user.email
      });
    }
  }

  addUsers(workspace.members.map((member) => member.user));
  addUsers(workspace.visibilityMembers.map((member) => member.user));

  if (workspace.visibility === WorkspaceVisibility.SPECIFIC_MEMBERS) {
    return [...candidates.values()].sort(compareWorkspaceAccessUsers);
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      nickname: true,
      email: true
    },
    orderBy: [{ name: "asc" }, { email: "asc" }, { createdAt: "desc" }]
  });

  if (workspace.visibility === WorkspaceVisibility.ALL_MEMBERS) {
    addUsers(users);
    return [...candidates.values()].sort(compareWorkspaceAccessUsers);
  }

  const roleAssignments = await prisma.platformRoleAssignment.findMany({
    select: {
      email: true,
      role: true
    }
  });

  const roleByEmail = new Map<string, PlatformRole>();
  for (const assignment of roleAssignments) {
    roleByEmail.set(normalizeEmail(assignment.email), assignment.role);
  }
  if (PLATFORM_SUPER_ADMIN_EMAIL) {
    roleByEmail.set(PLATFORM_SUPER_ADMIN_EMAIL, PlatformRole.SUPER_ADMIN);
  }

  const minimumRole =
    workspace.visibility === WorkspaceVisibility.ADMINS_ONLY ? PlatformRole.EXECUTIVE_PRODUCER : PlatformRole.ASSOCIATE_PRODUCER;

  addUsers(
    users.filter((user) => {
      const role = roleByEmail.get(normalizeEmail(user.email));
      return hasPlatformRole(role ?? null, minimumRole);
    })
  );

  return [...candidates.values()].sort(compareWorkspaceAccessUsers);
}

function compareWorkspaceAccessUsers(a: WorkspaceAccessUser, b: WorkspaceAccessUser) {
  const aLabel = userDisplayName(a).toLowerCase();
  const bLabel = userDisplayName(b).toLowerCase();
  return aLabel.localeCompare(bLabel);
}
