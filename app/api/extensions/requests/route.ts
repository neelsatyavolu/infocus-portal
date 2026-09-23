import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import {
  hasMemberDisagreed,
  isExtensionGranted,
  isGroupConsentComplete,
  REQUIRED_EXTENSION_APPROVALS,
  resolveGrantTerms
} from "@/src/lib/package-extensions";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { notifyStudentsOfExtensionGrant } from "@/src/server/extension-grant-notify";
import { mayDecideExtensionRequest, mayGrantExtensions } from "@/src/server/extension-requests";
import { MAX_CYCLES_PER_SEMESTER } from "@/src/server/program-settings";
import { labeledUser, userDisplayName } from "@/src/lib/user-display";

const createSchema = z.object({
  cycleNumber: z.number().int().min(1).max(MAX_CYCLES_PER_SEMESTER),
  requestedDays: z.number().int().min(1).max(30),
  reason: z.string().max(1200)
});

const decisionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("producer"),
    requestId: z.string().min(1),
    approved: z.boolean(),
    /** Only the first approving producer sets these; later approvals keep them. */
    grantedDays: z.number().int().min(1).max(30).optional(),
    grantedUserIds: z.array(z.string().min(1)).max(50).optional()
  }),
  z.object({
    kind: z.literal("member"),
    requestId: z.string().min(1),
    agreed: z.boolean()
  })
]);

type MemberSnapshot = {
  userId: string;
  name: string | null;
  email: string | null;
};

function serializeRequest(entry: {
  id: string;
  cycleNumber: number;
  requestedDays: number;
  grantedDays: number | null;
  grantedUserIds: string[];
  producerGranted: boolean;
  reason: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  createdAt: Date;
  decidedAt: Date | null;
  progressRowId: string | null;
  user: { id: string; name: string | null; email: string | null };
  approvals: Array<{
    userId: string;
    approved: boolean;
    createdAt: Date;
    user: { id: string; name: string | null; email: string | null };
  }>;
  memberConsents: Array<{
    userId: string;
    agreed: boolean;
    createdAt: Date;
    user: { id: string; name: string | null; email: string | null };
  }>;
  progressRow: {
    id: string;
    groupTopic: string;
    assignedProducerUserId: string | null;
    members: Array<{
      userId: string;
      user: { id: string; name: string | null; email: string | null };
    }>;
  } | null;
},
  viewer?: { userId: string; role: Parameters<typeof hasPlatformRole>[0] }
) {
  const groupMembers: MemberSnapshot[] = (entry.progressRow?.members ?? []).map((member) => ({
    userId: member.userId,
    ...labeledUser(member.user)
  }));

  // Prefer live roster; fall back to people who already consented if the row is gone.
  const memberUserIds =
    groupMembers.length > 0
      ? groupMembers.map((member) => member.userId)
      : entry.memberConsents.map((consent) => consent.userId);

  const consentState = {
    memberUserIds,
    consents: entry.memberConsents.map((consent) => ({
      userId: consent.userId,
      agreed: consent.agreed
    }))
  };

  const memberConsentComplete = isGroupConsentComplete(consentState);

  return {
    id: entry.id,
    cycleNumber: entry.cycleNumber,
    requestedDays: entry.requestedDays,
    grantedDays: entry.grantedDays,
    grantedUserIds: entry.grantedUserIds,
    producerGranted: entry.producerGranted,
    reason: entry.reason,
    status: entry.status,
    createdAt: entry.createdAt,
    decidedAt: entry.decidedAt,
    progressRowId: entry.progressRowId,
    groupTopic: entry.progressRow?.groupTopic ?? "",
    student: entry.user,
    groupMembers:
      groupMembers.length > 0
        ? groupMembers
        : entry.memberConsents.map((consent) => ({
            userId: consent.userId,
            name: userDisplayName(consent.user) || consent.user.name,
            email: consent.user.email
          })),
    memberConsents: entry.memberConsents.map((consent) => ({
      userId: consent.userId,
      agreed: consent.agreed,
      name: userDisplayName(consent.user) || consent.user.email,
      createdAt: consent.createdAt
    })),
    memberConsentComplete,
    canDecide: viewer
      ? mayDecideExtensionRequest(viewer.role, viewer.userId, {
          producerGranted: entry.producerGranted,
          assignedProducerUserId: entry.progressRow?.assignedProducerUserId,
          members: entry.progressRow?.members ?? []
        })
      : false,
    approvalsRequired: REQUIRED_EXTENSION_APPROVALS,
    approvals: entry.approvals.map((approval) => ({
      userId: approval.userId,
      approved: approval.approved,
      name: userDisplayName(approval.user) || approval.user.email,
      createdAt: approval.createdAt
    }))
  };
}

const requestInclude = {
  user: { select: { id: true, name: true, nickname: true, email: true } },
  approvals: {
    include: { user: { select: { id: true, name: true, nickname: true, email: true } } }
  },
  memberConsents: {
    include: { user: { select: { id: true, name: true, nickname: true, email: true } } }
  },
  progressRow: {
    select: {
      id: true,
      groupTopic: true,
      assignedProducerUserId: true,
      members: {
        select: {
          userId: true,
          user: { select: { id: true, name: true, nickname: true, email: true } }
        }
      }
    }
  }
} as const;

async function loadSerializedRequests(
  where: Record<string, unknown>,
  viewer?: { userId: string; role: Parameters<typeof hasPlatformRole>[0] }
) {
  const requests = await prisma.packageExtensionRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: requestInclude
  });

  return requests.map((entry) => serializeRequest(entry, viewer));
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    // Producers see the whole queue; students see requests for groups they are on
    // (or that they filed, for legacy rows without a progress link).
    const isProducer = hasPlatformRole(access.role, "ASSOCIATE_PRODUCER");
    const memberships = isProducer
      ? []
      : await prisma.packageProgressMember.findMany({
          where: { userId },
          select: { rowId: true }
        });
    const rowIds = memberships.map((entry) => entry.rowId);

    const viewer = { userId, role: access.role };
    const requests = await loadSerializedRequests(
      isProducer
        ? {}
        : {
            OR: [
              { userId },
              ...(rowIds.length > 0 ? [{ progressRowId: { in: rowIds } }] : [])
            ]
          },
      viewer
    );

    return ok({
      canDecide: requests.some((entry) => entry.canDecide),
      canGrant: mayGrantExtensions(access.role),
      currentUserId: userId,
      approvalsRequired: REQUIRED_EXTENSION_APPROVALS,
      requests
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await syncUserProfile(userId);

    const rate = limitByKey(getRequestKey(request, "extensions:request"), {
      max: 20,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = createSchema.parse(await request.json());

    const membership = await prisma.packageProgressMember.findFirst({
      where: {
        userId,
        row: { cycleNumber: payload.cycleNumber }
      },
      include: {
        row: {
          select: {
            id: true,
            members: { select: { userId: true } }
          }
        }
      }
    });

    if (!membership) {
      throw new Error(
        "You are not assigned to a package group for this cycle. Ask a producer to add you on Package Cycle first."
      );
    }

    const memberUserIds = membership.row.members.map((member) => member.userId);
    if (memberUserIds.length === 0) {
      throw new Error("Your package group has no members yet.");
    }

    const existingPending = await prisma.packageExtensionRequest.findFirst({
      where: {
        progressRowId: membership.row.id,
        status: "PENDING"
      },
      select: { id: true }
    });
    if (existingPending) {
      throw new Error(
        "This group already has a pending extension request. All members must agree on that request first."
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const extensionRequest = await tx.packageExtensionRequest.create({
        data: {
          userId,
          progressRowId: membership.row.id,
          cycleNumber: payload.cycleNumber,
          requestedDays: payload.requestedDays,
          reason: payload.reason.trim()
        }
      });

      // Requester auto-agrees; remaining members must consent.
      await tx.packageExtensionMemberConsent.create({
        data: {
          requestId: extensionRequest.id,
          userId,
          agreed: true
        }
      });

      return extensionRequest;
    });

    return ok({ id: created.id }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    const rate = limitByKey(getRequestKey(request, "extensions:decide"), {
      max: 60,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = decisionSchema.parse(await request.json());

    const existing = await prisma.packageExtensionRequest.findUnique({
      where: { id: payload.requestId },
      include: {
        memberConsents: true,
        approvals: true,
        progressRow: {
          select: {
            id: true,
            assignedProducerUserId: true,
            members: { select: { userId: true } }
          }
        }
      }
    });

    if (!existing) {
      throw new Error("NOT_FOUND");
    }

    if (existing.status !== "PENDING") {
      throw new Error("This extension request is already decided.");
    }

    const memberUserIds =
      existing.progressRow?.members.map((member) => member.userId) ??
      existing.memberConsents.map((consent) => consent.userId);

    if (payload.kind === "member") {
      if (!memberUserIds.includes(userId)) {
        throw new Error("FORBIDDEN");
      }
      if (existing.producerGranted) {
        throw new Error("Producers granted this extension. Group members don't need to agree.");
      }

      await prisma.packageExtensionMemberConsent.upsert({
        where: { requestId_userId: { requestId: payload.requestId, userId } },
        update: { agreed: payload.agreed },
        create: { requestId: payload.requestId, userId, agreed: payload.agreed }
      });

      if (!payload.agreed) {
        await prisma.packageExtensionRequest.update({
          where: { id: payload.requestId },
          data: { status: "DENIED", decidedAt: new Date() }
        });
        return ok({ status: "DENIED" as const });
      }

      return ok({ status: "PENDING" as const });
    }

    // Producer decision — associates only on assigned packages they are not members of;
    // producer grants only by execs outside the group.
    if (
      !mayDecideExtensionRequest(access.role, userId, {
        producerGranted: existing.producerGranted,
        assignedProducerUserId: existing.progressRow?.assignedProducerUserId,
        members: existing.progressRow?.members ?? []
      })
    ) {
      throw new Error("FORBIDDEN");
    }

    const consents = await prisma.packageExtensionMemberConsent.findMany({
      where: { requestId: payload.requestId },
      select: { userId: true, agreed: true }
    });

    const consentState = { memberUserIds, consents };

    if (payload.approved && !existing.producerGranted) {
      if (hasMemberDisagreed(consentState) || !isGroupConsentComplete(consentState)) {
        throw new Error(
          "All group members must agree to this extension request before producers can approve it."
        );
      }
    }

    // The first approving producer sets days and members; later approvals keep them.
    const termsLocked = existing.approvals.some(
      (approval) => approval.approved && approval.userId !== userId
    );
    const proposesTerms = payload.grantedDays !== undefined || payload.grantedUserIds !== undefined;
    if (payload.approved && termsLocked && proposesTerms) {
      throw new Error(
        "Another producer already set the extension days and students. Approve or deny those terms."
      );
    }
    const terms =
      payload.approved && !termsLocked
        ? resolveGrantTerms({
            requestedDays: existing.requestedDays,
            memberUserIds,
            grantedDays: payload.grantedDays,
            grantedUserIds: payload.grantedUserIds
          })
        : null;

    await prisma.$transaction(async (tx) => {
      await tx.packageExtensionApproval.upsert({
        where: { requestId_userId: { requestId: payload.requestId, userId } },
        update: { approved: payload.approved },
        create: { requestId: payload.requestId, userId, approved: payload.approved }
      });
      if (terms) {
        await tx.packageExtensionRequest.update({
          where: { id: payload.requestId },
          data: terms
        });
      }
    });

    const withApprovals = await prisma.packageExtensionRequest.findUniqueOrThrow({
      where: { id: payload.requestId },
      include: {
        approvals: true,
        memberConsents: true,
        progressRow: {
          select: { id: true, members: { select: { userId: true } } }
        }
      }
    });

    const liveMemberIds =
      withApprovals.progressRow?.members.map((member) => member.userId) ?? memberUserIds;

    const denied =
      withApprovals.approvals.some((entry) => !entry.approved) ||
      hasMemberDisagreed({
        memberUserIds: liveMemberIds,
        consents: withApprovals.memberConsents
      });

    const granted = isExtensionGranted({
      producerGranted: withApprovals.producerGranted,
      approvals: withApprovals.approvals.map((entry) => ({
        userId: entry.userId,
        approved: entry.approved
      })),
      memberUserIds: liveMemberIds,
      consents: withApprovals.memberConsents.map((entry) => ({
        userId: entry.userId,
        agreed: entry.agreed
      }))
    });

    const status = denied ? "DENIED" : granted ? "APPROVED" : "PENDING";

    await prisma.$transaction(async (tx) => {
      await tx.packageExtensionRequest.update({
        where: { id: payload.requestId },
        data: {
          status,
          decidedAt: status === "PENDING" ? null : new Date()
        }
      });

      // Group-level flag used on package progress once producers grant the extension.
      if (status === "APPROVED" && withApprovals.progressRowId) {
        await tx.packageProgressRow.update({
          where: { id: withApprovals.progressRowId },
          data: { extension: true }
        });
      }
    });

    if (status === "APPROVED" && withApprovals.producerGranted) {
      await notifyStudentsOfExtensionGrant(withApprovals.id);
    }

    return ok({ status });
  } catch (error) {
    return handleRouteError(error);
  }
}
