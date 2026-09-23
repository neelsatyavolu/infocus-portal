import type { PlatformRole } from "@prisma/client";
import { extensionRequestAwaitsUser } from "@/src/lib/package-extensions";
import { producerMayActOnPackage } from "@/src/lib/package-producer-assignment";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

/** Pending extension requests that need this user's agreement or producer vote (sidebar badge). */
export async function countExtensionRequestsAwaitingUser(userId: string, role: PlatformRole | null) {
  const isProducer = hasPlatformRole(role, "ASSOCIATE_PRODUCER");
  const pending = await prisma.packageExtensionRequest.findMany({
    where: {
      status: "PENDING",
      ...(isProducer ? {} : { progressRow: { members: { some: { userId } } } })
    },
    select: {
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
        memberUserIds:
          members.length > 0
            ? members.map((member) => member.userId)
            : request.memberConsents.map((consent) => consent.userId),
        consents: request.memberConsents,
        approvals: request.approvals,
        viewerMayDecide: producerMayActOnPackage(role, userId, {
          assignedProducerUserId: request.progressRow?.assignedProducerUserId,
          members
        })
      },
      userId
    );
  }).length;
}
