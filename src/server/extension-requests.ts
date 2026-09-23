import type { PlatformRole } from "@prisma/client";
import { extensionRequestAwaitsUser } from "@/src/lib/package-extensions";
import { producerMayActOnPackage } from "@/src/lib/package-producer-assignment";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

/** Execs (EP, adviser, super admin) may grant extensions directly. */
export function mayGrantExtensions(role: PlatformRole | null) {
  return hasPlatformRole(role, "EXECUTIVE_PRODUCER");
}

/**
 * Producer grants: any exec outside the group. Student requests: producers who
 * may act on the package (associates only on assigned packages).
 */
export function mayDecideExtensionRequest(
  role: PlatformRole | null,
  userId: string,
  request: {
    producerGranted: boolean;
    assignedProducerUserId?: string | null;
    members?: Array<{ userId: string }>;
  }
) {
  if (request.producerGranted) {
    return (
      mayGrantExtensions(role) && !(request.members ?? []).some((member) => member.userId === userId)
    );
  }
  return producerMayActOnPackage(role, userId, request);
}

/** Pending extension requests that need this user's agreement or producer vote (sidebar badge). */
export async function countExtensionRequestsAwaitingUser(userId: string, role: PlatformRole | null) {
  const isProducer = hasPlatformRole(role, "ASSOCIATE_PRODUCER");
  const pending = await prisma.packageExtensionRequest.findMany({
    where: {
      status: "PENDING",
      ...(isProducer ? {} : { progressRow: { members: { some: { userId } } } })
    },
    select: {
      producerGranted: true,
      memberConsents: { select: { userId: true, agreed: true } },
      approvals: { select: { userId: true, approved: true } },
      progressRow: {
        select: { assignedProducerUserId: true, members: { select: { userId: true } } }
      }
    }
  });

  return pending.filter((request) => {
    const members = request.progressRow?.members ?? [];
    return extensionRequestAwaitsUser(
      {
        status: "PENDING",
        producerGranted: request.producerGranted,
        memberUserIds:
          members.length > 0
            ? members.map((member) => member.userId)
            : request.memberConsents.map((consent) => consent.userId),
        consents: request.memberConsents,
        approvals: request.approvals,
        viewerMayDecide: mayDecideExtensionRequest(role, userId, {
          producerGranted: request.producerGranted,
          assignedProducerUserId: request.progressRow?.assignedProducerUserId,
          members
        })
      },
      userId
    );
  }).length;
}
