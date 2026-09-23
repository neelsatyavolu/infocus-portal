import { recordAssociateReviewHistory } from "@/src/server/associate-review-history";
import { ApprovalStatus, type PackageApprovalStage, type PlatformRole } from "@prisma/client";
import { userDisplayName } from "@/src/lib/user-display";
import {
  applyDecision,
  APPROVAL_STAGE_ORDER,
  unapproveStage,
  canActOnStage,
  canApproveAnyway,
  nextStage,
  remainingExecutiveSignoffs,
  requiredExecutiveSignoffs,
  type ApprovalState
} from "@/src/lib/package-approval";
import {
  associateMayProducePackage,
  isAssignedPackageProducer,
  isPackageMember,
  producerMayActOnPackage
} from "@/src/lib/package-producer-assignment";
import { hasPlatformRole, isExecutiveProducer, normalizeEmail } from "@/src/lib/platform-admin";
import { versionApprovedInStage } from "@/src/lib/initial-cut-review-versions";
import { prisma } from "@/src/lib/prisma";
import { wrapReviewNotice } from "@/src/lib/package-review-notice";
import { createStageComment } from "@/src/server/package-stage-comments";

/**
 * Approval hangs off the package (PackageProgressRow), not off any single cut:
 * stages 1–3 review the Initial Cut (v1, revised, then execs). Final Cut unlocks
 * after APPROVED.
 */
export async function getOrCreateApproval(progressRowId: string) {
  const existing = await prisma.packageApproval.findUnique({
    where: { progressRowId },
    include: { signoffs: true }
  });

  if (existing) {
    return existing;
  }

  return prisma.packageApproval.create({
    data: { progressRowId },
    include: { signoffs: true }
  });
}

/**
 * Resolve the package a cut belongs to. A media item can be either the initial
 * cut or the final cut of a package.
 */
export async function findProgressRowForMedia(mediaItemId: string) {
  return prisma.packageProgressRow.findFirst({
    where: {
      OR: [{ initialCutMediaItemId: mediaItemId }, { finalCutMediaItemId: mediaItemId }]
    },
    select: { id: true, category: true, initialCutMediaItemId: true, finalCutMediaItemId: true }
  });
}

function toApprovalState(approval: {
  stage: PackageApprovalStage;
  controversial: boolean;
  signoffs: Array<{ userId: string; stage: PackageApprovalStage; approved: boolean }>;
}): ApprovalState {
  return {
    stage: approval.stage,
    controversial: approval.controversial,
    signoffs: approval.signoffs.map((entry) => ({
      userId: entry.userId,
      stage: entry.stage,
      approved: entry.approved
    }))
  };
}

/** Stage that sent the package back, when the newest sign-off is a send-back. */
function sentBackFromStage(signoffs: Array<{ stage: PackageApprovalStage; approved: boolean; createdAt: Date }>) {
  const latest = [...signoffs].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  return latest && !latest.approved ? latest.stage : null;
}

/**
 * Who may stand in as the group's assigned producer for Stage 1.
 * Associates must be the assigned AP and must not be on the roster.
 * Assigned EP / super-admin may stand in. Unassigned packages have no Stage 1
 * owner until a producer is assigned.
 */
async function ownsPackageCategory(
  email: string | null,
  progressRowId: string,
  actorUserId?: string,
  role?: PlatformRole | null
) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }

  const row = await prisma.packageProgressRow.findUnique({
    where: { id: progressRowId },
    select: {
      assignedProducerUserId: true,
      assignedExecutiveProducerUserId: true,
      members: { select: { userId: true } }
    }
  });

  if (!row) {
    return false;
  }

  if (role === "ASSOCIATE_PRODUCER") {
    return associateMayProducePackage(row, actorUserId);
  }

  if (row.assignedProducerUserId || row.assignedExecutiveProducerUserId) {
    return isAssignedPackageProducer(row, actorUserId);
  }

  return false;
}

async function actorIsPackageMember(progressRowId: string, actorUserId: string) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: progressRowId },
    select: { members: { select: { userId: true } } }
  });
  return isPackageMember(row?.members, actorUserId);
}

function actorOwnsPackage(
  email: string | null,
  progressRowId: string,
  actorUserId: string,
  role: PlatformRole | null
) {
  if (role === "ASSOCIATE_PRODUCER" || isExecutiveProducer(role)) {
    return ownsPackageCategory(email, progressRowId, actorUserId, role);
  }
  return Promise.resolve(true);
}

export type ApprovalActorContext = {
  userId: string;
  email: string | null;
  role: PlatformRole | null;
};

export async function loadApprovalView(progressRowId: string, actor: ApprovalActorContext) {
  const approval = await getOrCreateApproval(progressRowId);
  const state = toApprovalState(approval);
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: progressRowId },
    select: { awaitingRevisedInitialCut: true, queuedForAirAt: true }
  });
  const [ownsCategory, packageMember] = await Promise.all([
    actorOwnsPackage(actor.email, progressRowId, actor.userId, actor.role),
    actorIsPackageMember(progressRowId, actor.userId)
  ]);
  const canAct =
    canActOnStage(state, {
      userId: actor.userId,
      role: actor.role,
      ownsCategory,
      isPackageMember: packageMember
    }) && !(approval.stage === "ASSOCIATE_REVIEW" && row?.awaitingRevisedInitialCut);

  return {
    progressRowId,
    stage: approval.stage,
    controversial: approval.controversial,
    socialMedia: approval.socialMedia,
    remainingExecutiveSignoffs: remainingExecutiveSignoffs(state),
    canAct: canAct && !state.signoffs.some((entry) =>
      entry.stage === state.stage && entry.userId === actor.userId && entry.approved),
    canUnapprove: !row?.queuedForAirAt && unapproveStage(state, {
      userId: actor.userId, role: actor.role, ownsCategory, isPackageMember: packageMember
    }) !== null,
    canApproveAnyway: canApproveAnyway(
      state,
      { userId: actor.userId, role: actor.role, ownsCategory, isPackageMember: packageMember },
      {
        sentBackFromStage: sentBackFromStage(approval.signoffs),
        awaitingRevisedInitialCut: Boolean(row?.awaitingRevisedInitialCut)
      }
    ),
    awaitingRevisedInitialCut: Boolean(row?.awaitingRevisedInitialCut),
    signoffs: approval.signoffs.map((entry) => ({
      userId: entry.userId,
      stage: entry.stage,
      approved: entry.approved,
      note: entry.note,
      mediaItemId: entry.mediaItemId,
      createdAt: entry.createdAt
    }))
  };
}

/** A package cannot enter the chain until the Initial Cut exists. */
export async function submitForReview(progressRowId: string) {
  const approval = await getOrCreateApproval(progressRowId);

  if (approval.stage !== "DRAFT") {
    return approval;
  }

  const row = await prisma.packageProgressRow.findUnique({
    where: { id: progressRowId },
    select: { initialCutMediaItemId: true }
  });

  if (!row?.initialCutMediaItemId) {
    throw new Error("BAD_REQUEST");
  }

  // Resubmitting clears prior sign-offs so a returned package cannot inherit
  // executive approvals it collected before the changes were requested.
  await prisma.packageApprovalSignoff.deleteMany({ where: { approvalId: approval.id } });

  return prisma.packageApproval.update({
    where: { id: approval.id },
    data: { stage: "ASSOCIATE_REVIEW" },
    include: { signoffs: true }
  });
}

/** The cut a given stage is reviewing, used to stamp the sign-off. */
async function mediaItemForStage(progressRowId: string) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: progressRowId },
    select: { initialCutMediaItemId: true, finalCutMediaItemId: true }
  });

  if (!row) {
    return null;
  }

  return row.initialCutMediaItemId;
}

export async function recordDecision(
  progressRowId: string,
  actor: ApprovalActorContext,
  approved: boolean,
  note: string,
  mediaVersionId?: string
) {
  const approval = await getOrCreateApproval(progressRowId);
  const state = toApprovalState(approval);
  const [ownsCategory, packageMember] = await Promise.all([
    actorOwnsPackage(actor.email, progressRowId, actor.userId, actor.role),
    actorIsPackageMember(progressRowId, actor.userId)
  ]);

  const row = await prisma.packageProgressRow.findUnique({
    where: { id: progressRowId },
    select: {
      awaitingRevisedInitialCut: true,
      initialCutMediaItem: { select: { currentVersion: { select: { id: true } } } }
    }
  });

  if (mediaVersionId && mediaVersionId !== row?.initialCutMediaItem?.currentVersion?.id) {
    throw new Error("BAD_REQUEST");
  }
  if (
    (state.stage === "ASSOCIATE_REVIEW" && row?.awaitingRevisedInitialCut) ||
    state.signoffs.some((entry) => entry.stage === state.stage && entry.userId === actor.userId && entry.approved)
  ) {
    throw new Error("FORBIDDEN");
  }

  const decision = applyDecision(
    state,
    { userId: actor.userId, role: actor.role, ownsCategory, isPackageMember: packageMember },
    approved,
    { awaitingRevisedInitialCut: row?.awaitingRevisedInitialCut ?? false }
  );

  if (decision.type === "FORBIDDEN") {
    throw new Error("FORBIDDEN");
  }

  const mediaItemId = await mediaItemForStage(progressRowId);

  await prisma.$transaction(async (tx) => {
    if (approval.stage === "ASSOCIATE_REVIEW") {
      await recordAssociateReviewHistory({ rowId: progressRowId, stage: "initial-cut", kind: "review", actorId: actor.userId, note }, tx);
    }
    // A Stage 3 send-back clears earlier exec votes so the next version needs
    // fresh sign-offs. Clear them before recording this one so it survives.
    if (decision.type === "SEND_BACK" && approval.stage === "EXECUTIVE_REVIEW") {
      await tx.packageApprovalSignoff.deleteMany({
        where: { approvalId: approval.id, stage: "EXECUTIVE_REVIEW" }
      });
    }
    await tx.packageApprovalSignoff.create({
      data: {
        approvalId: approval.id,
        userId: actor.userId,
        stage: approval.stage,
        approved,
        note,
        mediaItemId
      }
    });

    if (mediaItemId) {
      const cut = await tx.mediaItem.findUnique({
        where: { id: mediaItemId },
        select: { currentVersionId: true }
      });
      if (cut?.currentVersionId) {
        await tx.mediaVersion.update({
          where: { id: cut.currentVersionId },
          data: {
            approvalStatus: approved ? ApprovalStatus.APPROVED : ApprovalStatus.NEEDS_CHANGES
          }
        });
      }
    }

    // The package stays at this stage; the next upload comes back here.
    if (decision.type === "SEND_BACK") {
      await tx.packageProgressRow.update({
        where: { id: progressRowId },
        data: { awaitingRevisedInitialCut: false }
      });

      return;
    }

    if (approval.stage === "ASSOCIATE_REVIEW" && decision.type === "ADVANCE") {
      await tx.packageProgressRow.update({
        where: { id: progressRowId },
        data: { awaitingRevisedInitialCut: false, initialCut: true }
      });
    }

    if (approval.stage !== "EXECUTIVE_REVIEW") {
      await tx.packageApproval.update({
        where: { id: approval.id },
        data: { stage: nextStage(approval.stage) }
      });

      return;
    }

    // Recount inside the transaction. Deciding from the pre-transaction read
    // lets two executives approving concurrently each see one signature
    // outstanding, so neither advances the package and it sticks at stage 3.
    const executiveApprovals = await tx.packageApprovalSignoff.findMany({
      where: { approvalId: approval.id, stage: "EXECUTIVE_REVIEW", approved: true },
      select: { userId: true }
    });

    const distinctApprovers = new Set(executiveApprovals.map((entry) => entry.userId)).size;

    if (distinctApprovers >= requiredExecutiveSignoffs(approval.controversial)) {
      await tx.packageApproval.update({
        where: { id: approval.id },
        data: { stage: "APPROVED" }
      });
    }
  });

  if (decision.type === "ADVANCE" && approval.stage === "ASSOCIATE_REVIEW") {
    const { notifyPackageReview } = await import("@/src/server/package-review-notify");
    try {
      await notifyPackageReview({
        progressRowId,
        kind: "adviser",
        mediaVersionId: row?.initialCutMediaItem?.currentVersion?.id
      });
    } catch (error) {
      console.error("notifyPackageReview failed", error);
    }
  }

  if (decision.type === "ADVANCE" && approval.stage === "ADVISER_REVIEW") {
    const { notifyPackageReview } = await import("@/src/server/package-review-notify");
    await notifyPackageReview({ progressRowId, kind: "execs" });
  }

  if (
    decision.type === "ADVANCE" ||
    decision.type === "SEND_BACK"
  ) {
    const reviewer = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { name: true, nickname: true, email: true }
    });
    const reviewerName = reviewer ? userDisplayName(reviewer) || "A producer" : "A producer";
    const excerpt = note.trim();
    if (approved && excerpt) {
      const { createApprovalStageComment } = await import("@/src/server/package-stage-comments");
      await createApprovalStageComment({
        rowId: progressRowId,
        stage: "initial-cut",
        authorId: actor.userId,
        body: excerpt
      });
    }
    const { notifyPackageMembersOfDecision } = await import("@/src/server/package-review-notify");
    const kind =
      decision.type === "SEND_BACK"
        ? "sent-back"
        : approval.stage === "ASSOCIATE_REVIEW"
          ? "stage-1"
          : approval.stage === "ADVISER_REVIEW"
            ? "stage-2"
            : "approved";
    try {
      await notifyPackageMembersOfDecision({
        progressRowId,
        kind,
        reviewerName,
        excludeUserId: actor.userId,
        excerpt
      });
    } catch (error) {
      console.error("notifyPackageMembersOfDecision failed", error);
    }
  }

  return decision;
}

/**
 * Approve anyway: after submitting a Stage 1 review (needs revisions), the
 * Stage 1 owner sends the latest Initial Cut to Stage 2 without a new upload.
 */
export async function approveAnyway(progressRowId: string, actor: ApprovalActorContext) {
  const approval = await getOrCreateApproval(progressRowId);
  const [ownsCategory, packageMember] = await Promise.all([
    actorOwnsPackage(actor.email, progressRowId, actor.userId, actor.role),
    actorIsPackageMember(progressRowId, actor.userId)
  ]);
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: progressRowId },
    select: {
      awaitingRevisedInitialCut: true,
      initialCutMediaItemId: true,
      initialCutMediaItem: { select: { currentVersionId: true } }
    }
  });
  const actorContext = { userId: actor.userId, role: actor.role, ownsCategory, isPackageMember: packageMember };
  const context = {
    sentBackFromStage: sentBackFromStage(approval.signoffs),
    awaitingRevisedInitialCut: Boolean(row?.awaitingRevisedInitialCut)
  };
  if (!row?.initialCutMediaItemId || !canApproveAnyway(toApprovalState(approval), actorContext, context)) {
    throw new Error("FORBIDDEN");
  }
  const versionId = row.initialCutMediaItem?.currentVersionId ?? null;
  const note = "Approved anyway — sent to Stage 2 without a new upload";

  await prisma.$transaction(async (tx) => {
    // Guard against a new upload that already moved the package on.
    const moved = await tx.packageApproval.updateMany({
      where: { id: approval.id, stage: approval.stage },
      data: { stage: "ADVISER_REVIEW" }
    });
    if (moved.count === 0) throw new Error("FORBIDDEN");
    await tx.packageProgressRow.update({
      where: { id: progressRowId },
      data: { awaitingRevisedInitialCut: false, initialCut: true }
    });
    await tx.packageApprovalSignoff.create({
      data: {
        approvalId: approval.id,
        userId: actor.userId,
        stage: "ASSOCIATE_REVIEW",
        approved: true,
        note,
        mediaItemId: row.initialCutMediaItemId
      }
    });
    if (versionId) {
      await tx.mediaVersion.update({ where: { id: versionId }, data: { approvalStatus: ApprovalStatus.APPROVED } });
    }
  });

  const { notifyPackageReview, notifyPackageMembersOfDecision } = await import("@/src/server/package-review-notify");
  const reviewer = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true, nickname: true, email: true }
  });
  try {
    await notifyPackageReview({ progressRowId, kind: "adviser", mediaVersionId: versionId });
  } catch (error) {
    console.error("notifyPackageReview failed", error);
  }
  try {
    await notifyPackageMembersOfDecision({
      progressRowId,
      kind: "stage-1",
      reviewerName: reviewer ? userDisplayName(reviewer) || "A producer" : "A producer",
      excludeUserId: actor.userId
    });
  } catch (error) {
    console.error("notifyPackageMembersOfDecision failed", error);
  }
}

export async function submitCutReview(
  progressRowId: string,
  actor: ApprovalActorContext,
  mediaVersionId?: string | null
) {
  if (!hasPlatformRole(actor.role, "ASSOCIATE_PRODUCER")) {
    throw new Error("FORBIDDEN");
  }

  const row = await prisma.packageProgressRow.findUnique({
    where: { id: progressRowId },
    select: {
      assignedProducerUserId: true,
      members: { select: { userId: true } },
      initialCutMediaItemId: true,
      initialCutMediaItem: {
        select: {
          id: true,
          projectId: true,
          currentVersionId: true,
          currentVersion: { select: { id: true, approvalStatus: true } }
        }
      }
    }
  });
  if (!row?.initialCutMediaItemId || !row.initialCutMediaItem) {
    throw new Error("BAD_REQUEST");
  }
  if (!producerMayActOnPackage(actor.role, actor.userId, row)) {
    throw new Error("FORBIDDEN");
  }

  const versionId = mediaVersionId ?? row.initialCutMediaItem.currentVersionId;
  if (!versionId) {
    throw new Error("BAD_REQUEST");
  }

  const version = await prisma.mediaVersion.findFirst({
    where: { id: versionId, mediaItemId: row.initialCutMediaItemId }
  });
  if (!version) {
    throw new Error("NOT_FOUND");
  }

  // The review decision and the package chain must agree, and only the current cut can act.
  if (version.id !== row.initialCutMediaItem.currentVersionId) {
    throw new Error("BAD_REQUEST");
  }
  await recordDecision(progressRowId, actor, false, "Review submitted — needs revisions", version.id);

  const reviewer = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true, nickname: true, email: true }
  });
  const reviewerName = reviewer ? userDisplayName(reviewer) || "A producer" : "A producer";

  await createStageComment({
    rowId: progressRowId,
    stage: "initial-cut",
    authorId: actor.userId,
    body: wrapReviewNotice(
      {
        projectId: row.initialCutMediaItem.projectId,
        mediaId: row.initialCutMediaItem.id,
        versionId: version.id
      },
      `${reviewerName} submitted a review. Open Review to see comments and upload a new version.`
    )
  });

  return { status: ApprovalStatus.NEEDS_CHANGES, mediaVersionId: version.id };
}

export async function setControversial(progressRowId: string, controversial: boolean) {
  const approval = await getOrCreateApproval(progressRowId);

  return prisma.packageApproval.update({
    where: { id: approval.id },
    data: { controversial }
  });
}

export async function unapproveCut(progressRowId: string, actor: ApprovalActorContext) {
  const [ownsCategory, packageMember] = await Promise.all([
    actorOwnsPackage(actor.email, progressRowId, actor.userId, actor.role),
    actorIsPackageMember(progressRowId, actor.userId)
  ]);
  await prisma.$transaction(async (tx) => {
    const approval = await tx.packageApproval.findUnique({
      where: { progressRowId }, include: { signoffs: true }
    });
    const row = await tx.packageProgressRow.findUnique({
      where: { id: progressRowId },
      select: { queuedForAirAt: true, initialCutMediaItem: { select: { currentVersionId: true, versions: true } } }
    });
    if (!approval || !row || row.queuedForAirAt) throw new Error("FORBIDDEN");
    const stage = unapproveStage(toApprovalState(approval), {
      userId: actor.userId, role: actor.role, ownsCategory, isPackageMember: packageMember
    });
    if (!stage) throw new Error("FORBIDDEN");
    const remaining = approval.signoffs.filter((entry) =>
      stage === "EXECUTIVE_REVIEW"
        ? entry.stage !== stage || entry.userId !== actor.userId
        : APPROVAL_STAGE_ORDER.indexOf(entry.stage) < APPROVAL_STAGE_ORDER.indexOf(stage)
    );
    const versions = row.initialCutMediaItem?.versions ?? [];
    const invalidatedVersionIds = versions.filter((version) =>
      versionApprovedInStage(version.id, versions, approval.signoffs) !== null &&
      versionApprovedInStage(version.id, versions, remaining) === null
    ).map((version) => version.id);
    if (row.initialCutMediaItem?.currentVersionId) {
      invalidatedVersionIds.push(row.initialCutMediaItem.currentVersionId);
    }
    // Earlier-stage withdrawal invalidates later approvals; an EP withdraws only their own vote.
    await tx.packageApprovalSignoff.deleteMany({
      where: {
        approvalId: approval.id,
        ...(stage === "EXECUTIVE_REVIEW"
          ? { stage, userId: actor.userId }
          : { stage: { in: APPROVAL_STAGE_ORDER.slice(APPROVAL_STAGE_ORDER.indexOf(stage)) } })
      }
    });
    await tx.packageApproval.update({ where: { id: approval.id }, data: { stage } });
    await tx.packageProgressRow.update({
      where: { id: progressRowId }, data: { awaitingRevisedInitialCut: false }
    });
    await tx.mediaVersion.updateMany({
      where: { id: { in: invalidatedVersionIds } },
      data: { approvalStatus: ApprovalStatus.IN_REVIEW }
    });
  });
}
