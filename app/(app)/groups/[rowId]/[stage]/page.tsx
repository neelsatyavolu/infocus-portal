import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { StageWorkspace } from "@/components/package-cycle/stage-workspace";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { serializeProofs } from "@/src/lib/package-brainstorm";
import { APPROVAL_COMMENT_PREFIX } from "@/src/lib/package-stage-comments";
import { brainstormNeedsChanges } from "@/src/lib/package-stage-status";
import { currentCutRevisionStage } from "@/src/lib/initial-cut-review-versions";
import { isCycleStageSlug } from "@/src/lib/package-cycle-gates";
import {
  initialReviewStageFromSlug,
  effectiveGroupApprovalStage,
  GROUP_NAV_TAB_LABELS,
  isGroupNavSlug,
  pendingGroupNavSlug,
  workspaceSlugFromNav
} from "@/src/lib/package-stages";
import { producerMayActOnPackage } from "@/src/lib/package-producer-assignment";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { BrainstormingPanel, PitchingPanel } from "../early-stage-panel";
import { GroupStageShell } from "../group-stage-shell";
import type { GroupStageFacts } from "../stage-bar-model";

function producerName(person: { name: string | null; nickname?: string | null; email: string | null } | null) {
  if (!person) return null;
  return userDisplayName(person) || null;
}

function latestIso(dates: Date[]) {
  const latest = dates.reduce<Date | null>((max, date) => (!max || date > max ? date : max), null);
  return latest ? latest.toISOString() : null;
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ rowId: string; stage: string }>;
}): Promise<Metadata> {
  const { rowId, stage } = await params;
  const stageLabel = isGroupNavSlug(stage) ? GROUP_NAV_TAB_LABELS[stage] : null;
  try {
    const { platformRole } = await getCurrentAppUser();
    if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) return { title: "Group" };
    const row = await prisma.packageProgressRow.findUnique({ where: { id: rowId }, select: { groupTopic: true } });
    const topic = row?.groupTopic?.trim() || "Group";
    return { title: stageLabel ? `${topic} · ${stageLabel}` : topic };
  } catch {
    return { title: "Group" };
  }
}

export default async function GroupStagePage({
  params
}: {
  params: Promise<{ rowId: string; stage: string }>;
}) {
  const { platformRole, userId } = await getCurrentAppUser();
  if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
    redirect("/access-denied");
  }

  const { rowId, stage } = await params;
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: rowId },
    include: {
      members: { include: { user: { select: { name: true, nickname: true, email: true } } } },
      assignedProducer: { select: { name: true, nickname: true, email: true } },
      assignedExecutiveProducer: { select: { name: true, nickname: true, email: true } },
      approval: {
        select: {
          stage: true,
          signoffs: { select: { stage: true, approved: true, mediaItemId: true, createdAt: true } }
        }
      },
      initialCutMediaItem: {
        select: { currentVersion: { select: { createdAt: true, approvalStatus: true } } }
      },
      proofOfContacts: { select: { id: true, slot: true, fileName: true, mimeType: true, updatedAt: true } },
      stageComments: {
        where: { stage: "brainstorming", NOT: { body: { startsWith: APPROVAL_COMMENT_PREFIX } } },
        select: { stage: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
  if (!row) {
    notFound();
  }

  const nav = {
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    aRollBRoll: row.aRollBRoll,
    finalCut: row.finalCut,
    approvalStage: effectiveGroupApprovalStage(
      row.approval?.stage,
      row.initialCutMediaItem?.currentVersion?.approvalStatus === "NEEDS_CHANGES",
      currentCutRevisionStage(
        row.initialCutMediaItemId && row.initialCutMediaItem?.currentVersion
          ? { mediaItemId: row.initialCutMediaItemId, createdAt: row.initialCutMediaItem.currentVersion.createdAt }
          : null,
        row.approval?.signoffs ?? []
      )
    )
  };

  if (stage === "initial-cut") {
    redirect(`/groups/${rowId}/${pendingGroupNavSlug(nav)}` as never);
  }

  if (!isGroupNavSlug(stage)) {
    redirect(`/groups/${rowId}/${pendingGroupNavSlug(nav)}` as never);
  }

  const members = row.members
    .map((member) => userDisplayName(member.user) || member.user.email)
    .filter(Boolean)
    .join(", ");
  const workSlug = workspaceSlugFromNav(stage);
  const canEdit = producerMayActOnPackage(platformRole, userId, row);
  const needsChanges = brainstormNeedsChanges(row);
  const proofsUpdatedAt = latestIso(row.proofOfContacts.map((proof) => proof.updatedAt));
  const brainstormFeedbackAt = row.stageComments[0]?.createdAt.toISOString() ?? null;

  // Stage bar statuses, from data this page already loads (no extra queries).
  const facts: GroupStageFacts = {
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    aRollBRoll: row.aRollBRoll,
    finalCut: row.finalCut,
    approvalStage: nav.approvalStage,
    rawApprovalStage: row.approval?.stage ?? "DRAFT",
    proofCount: row.proofOfContacts.length,
    brainstormDocUrl: row.brainstormDocUrl,
    brainstormNeedsChanges: needsChanges,
    initialCut: row.initialCut,
    initialCutHasMedia: Boolean(row.initialCutMediaItemId),
    awaitingRevisedInitialCut: row.awaitingRevisedInitialCut,
    initialCutNeedsRevisions: row.initialCutMediaItem?.currentVersion?.approvalStatus === "NEEDS_CHANGES",
    finalCutHasMedia: Boolean(row.finalCutMediaItemId),
    queuedForAir: Boolean(row.queuedForAirAt),
    queuedForShowDate: row.queuedForShowDate,
    proofsUpdatedAt,
    brainstormFeedbackAt,
    latestCutAt: row.initialCutMediaItem?.currentVersion?.createdAt.toISOString() ?? null,
    signoffs: (row.approval?.signoffs ?? []).map((signoff) => ({
      stage: signoff.stage,
      approved: signoff.approved,
      createdAt: signoff.createdAt.toISOString()
    }))
  };

  return (
    <GroupStageShell
      rowId={row.id}
      stage={stage}
      groupTopic={row.groupTopic}
      cycleNumber={row.cycleNumber}
      members={members}
      assignedProducer={producerName(row.assignedProducer)}
      assignedExecutive={producerName(row.assignedExecutiveProducer)}
      facts={facts}
    >
      {isCycleStageSlug(workSlug) ? (
        <StageWorkspace
          slug={workSlug}
          rowId={row.id}
          producerChrome
          embedded
          reviewStage={initialReviewStageFromSlug(stage) ?? undefined}
        />
      ) : stage === "pitching" ? (
        <PitchingPanel rowId={row.id} approved={row.pitching} canEdit={canEdit} />
      ) : (
        <BrainstormingPanel
          rowId={row.id}
          proofs={serializeProofs(row.proofOfContacts)}
          docUrl={row.brainstormDocUrl}
          approved={row.proofOfContact}
          needsChanges={needsChanges}
          canEdit={canEdit}
          proofsUpdatedAt={proofsUpdatedAt}
          feedbackAt={brainstormFeedbackAt}
        />
      )}
    </GroupStageShell>
  );
}
