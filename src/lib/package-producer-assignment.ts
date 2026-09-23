import type { PlatformRole } from "@prisma/client";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { userDisplayName } from "@/src/lib/user-display";

export type AssignedProducerRef = {
  userId: string;
  name: string | null;
  email: string | null;
};

export function exclusiveProducerAssignment(
  userId: string | null,
  user: AssignedProducerRef | null,
  executiveIds: Iterable<string>
) {
  const isExecutive = Boolean(userId && new Set(executiveIds).has(userId));
  if (!userId || !user) {
    return {
      assignedProducerUserId: null,
      assignedProducer: null,
      assignedExecutiveProducerUserId: null,
      assignedExecutiveProducer: null
    };
  }
  if (isExecutive) {
    return {
      assignedProducerUserId: null,
      assignedProducer: null,
      assignedExecutiveProducerUserId: userId,
      assignedExecutiveProducer: user
    };
  }
  return {
    assignedProducerUserId: userId,
    assignedProducer: user,
    assignedExecutiveProducerUserId: null,
    assignedExecutiveProducer: null
  };
}

export function selectedAssignedProducerId(row: {
  assignedProducerUserId?: string | null;
  assignedExecutiveProducerUserId?: string | null;
}) {
  return row.assignedExecutiveProducerUserId || row.assignedProducerUserId || "";
}

/** True when this user is the group's assigned AP or assigned EP. */
export function isAssignedPackageProducer(
  row: {
    assignedProducerUserId?: string | null;
    assignedExecutiveProducerUserId?: string | null;
  },
  userId?: string | null
) {
  return Boolean(userId && selectedAssignedProducerId(row) === userId);
}

export function isPackageMember(members: Array<{ userId: string }> | undefined, userId?: string | null) {
  return Boolean(userId && members?.some((member) => member.userId === userId));
}

/**
 * Associate producers may only take producer actions on packages they are
 * assigned to, and never on a package they belong to as a member.
 */
export function associateMayProducePackage(
  row: {
    assignedProducerUserId?: string | null;
    members?: Array<{ userId: string }>;
  },
  userId?: string | null
) {
  if (!userId) return false;
  if (isPackageMember(row.members, userId)) return false;
  return row.assignedProducerUserId === userId;
}

/**
 * Who may approve check-ins, write producer comments, or otherwise act as the
 * producer on a package. Associates are limited to assigned groups they are
 * not members of. Executives, the adviser, and super-admin may act on any.
 */
export function producerMayActOnPackage(
  role: PlatformRole | null,
  userId: string,
  row: {
    assignedProducerUserId?: string | null;
    members?: Array<{ userId: string }>;
  }
) {
  if (!hasPlatformRole(role, "ASSOCIATE_PRODUCER")) return false;
  if (role === "ASSOCIATE_PRODUCER") {
    return associateMayProducePackage(row, userId);
  }
  return true;
}

export function mergeAssignableProducerOptions<T extends AssignedProducerRef>(
  producers: T[],
  executives: T[]
): Array<T & { kind: "ap" | "ep" }> {
  const executiveIdSet = new Set(executives.map((user) => user.userId));
  const seen = new Set<string>();
  const merged: Array<T & { kind: "ap" | "ep" }> = [];

  for (const user of [...executives, ...producers]) {
    if (seen.has(user.userId)) continue;
    seen.add(user.userId);
    merged.push({
      ...user,
      kind: executiveIdSet.has(user.userId) ? "ep" : "ap"
    });
  }

  return merged.sort((a, b) => {
    const aLabel = userDisplayName(a).toLowerCase();
    const bLabel = userDisplayName(b).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
}
