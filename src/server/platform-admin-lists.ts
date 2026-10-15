import { prisma } from "@/src/lib/prisma";

/**
 * The lists Admin loads, shared by their GET routes (/api/platform/roles, /users,
 * /access-requests) and the Admin page's first paint. Callers check access first.
 */

export function listRoleAssignments() {
  return prisma.platformRoleAssignment.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }]
  });
}

export function listPlatformUsers() {
  return prisma.user.findMany({
    orderBy: [{ name: "asc" }, { email: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      name: true,
      nickname: true,
      createdAt: true
    }
  });
}

const ACCESS_REQUEST_STATUS_WEIGHT: Record<string, number> = {
  PENDING: 0,
  APPROVED: 1,
  DENIED: 2
};

/** Pending first, then newest first. */
export async function listAccessRequests() {
  const requests = await prisma.platformAccessRequest.findMany({
    orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }]
  });

  return [...requests].sort((a, b) => {
    const byStatus = (ACCESS_REQUEST_STATUS_WEIGHT[a.status] ?? 10) - (ACCESS_REQUEST_STATUS_WEIGHT[b.status] ?? 10);
    if (byStatus !== 0) {
      return byStatus;
    }

    return b.requestedAt.getTime() - a.requestedAt.getTime();
  });
}
