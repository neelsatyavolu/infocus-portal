import type { PackageCategory, PlatformRole } from "@prisma/client";
import { groupViewerAttention } from "@/src/lib/group-tile-status";
import { filterGroupsForViewer } from "@/src/lib/groups-visibility";

export type GroupAttention = "needed" | "waiting" | null;

/** The Groups roster fields that visibility and attention read. */
export type AttentionRow = {
  groupTopic?: string;
  groupMembers?: string;
  category?: PackageCategory | null;
  approvalStage?: string | null;
  assignedProducerUserId?: string | null;
  assignedExecutiveProducerUserId?: string | null;
  members?: Array<{ userId: string }>;
  memberUserIds?: string[];
  pitching: boolean;
  proofOfContact: boolean;
  aRollBRoll: boolean;
  initialCut: boolean;
  finalCut: boolean;
  proofs?: unknown[];
  brainstormDocUrl?: string;
  aRollHasMedia?: boolean;
  initialCutNeedsRevisions?: boolean;
  finalCutMediaItemId?: string | null;
  queuedForAir?: boolean;
  finalCutGraded?: boolean;
  finalCutScoredByUserIds?: string[];
};

type GroupsViewer = {
  platformRole: PlatformRole | null;
  currentUserId: string;
  producerCategory: PackageCategory | null;
};

/** Rows with nothing filled in yet are hidden on Groups. */
export function rowHasContent(row: AttentionRow) {
  return Boolean(
    row.groupTopic?.trim() ||
      row.groupMembers?.trim() ||
      (row.memberUserIds && row.memberUserIds.length > 0) ||
      (row.members && row.members.length > 0) ||
      row.assignedProducerUserId ||
      row.assignedExecutiveProducerUserId ||
      row.pitching ||
      row.proofOfContact ||
      row.aRollBRoll ||
      row.initialCut ||
      row.finalCut ||
      Boolean(row.brainstormDocUrl?.trim()) ||
      Boolean(row.proofs && row.proofs.length > 0)
  );
}

/**
 * Whether a group is waiting on this viewer ("needed"), on someone else ("waiting"), or neither.
 * The same rule and field mapping as the sidebar's Groups count (src/server/nav-status.ts):
 * executives, the adviser and super admin only; associates always get null.
 */
export function viewerAttention(
  platformRole: PlatformRole | null,
  currentUserId: string,
  row: AttentionRow
): GroupAttention {
  return groupViewerAttention(platformRole, row.approvalStage, {
    finalCutHasMedia: Boolean(row.finalCutMediaItemId),
    queuedForAir: Boolean(row.queuedForAir),
    finalCutGraded: Boolean(row.finalCutGraded),
    currentUserId,
    scoredByUserIds: row.finalCutScoredByUserIds,
    assignedProducerUserId: row.assignedProducerUserId,
    assignedExecutiveProducerUserId: row.assignedExecutiveProducerUserId,
    proofOfContact: row.proofOfContact,
    proofCount: row.proofs?.length ?? 0,
    brainstormDocUrl: row.brainstormDocUrl ?? "",
    aRollBRoll: row.aRollBRoll,
    aRollHasMedia: Boolean(row.aRollHasMedia),
    initialCutNeedsRevisions: Boolean(row.initialCutNeedsRevisions)
  });
}

/** The groups a viewer sees on /groups (content only, then the role's visibility rules). */
export function visibleGroupRows<T extends AttentionRow>(rows: T[], viewer: GroupsViewer): T[] {
  return filterGroupsForViewer(rows.filter(rowHasContent), viewer);
}
