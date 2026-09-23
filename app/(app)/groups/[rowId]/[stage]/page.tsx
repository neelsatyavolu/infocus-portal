import { redirect } from "next/navigation";
import { StageWorkspace } from "@/components/package-cycle/stage-workspace";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { serializeProofs } from "@/src/lib/package-brainstorm";
import { currentCutRevisionStage } from "@/src/lib/initial-cut-review-versions";
import { isCycleStageSlug } from "@/src/lib/package-cycle-gates";
import {
  initialReviewStageFromSlug,
  effectiveGroupApprovalStage,
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

function producerName(person: { name: string | null; nickname?: string | null; email: string | null } | null) {
  if (!person) return null;
  return userDisplayName(person) || null;
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
      proofOfContacts: { select: { id: true, slot: true, fileName: true, mimeType: true } }
    }
  });
  if (!row) {
    redirect("/groups");
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

  return (
    <GroupStageShell
      rowId={row.id}
      stage={stage}
      groupTopic={row.groupTopic}
      cycleNumber={row.cycleNumber}
      members={members}
      assignedProducer={producerName(row.assignedProducer)}
      assignedExecutive={producerName(row.assignedExecutiveProducer)}
      nav={nav}
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
          canEdit={canEdit}
        />
      )}
    </GroupStageShell>
  );
}
