import type { PackageCategory, PlatformRole } from "@prisma/client";
import { viewerAttention, type GroupAttention } from "@/components/groups/group-attention";
import {
  canApprovePitchFromTile,
  finalCutGradePendingFromViewer,
  finalCutGradesPill,
  groupTileStatus,
  type GroupTileStatus
} from "@/src/lib/group-tile-status";
import { groupScheduleStatus, type GroupScheduleInput, type GroupScheduleStatus } from "@/src/lib/group-schedule";
import { extensionBadgeLabel, extensionDueIn } from "@/src/lib/package-extensions";
import { producerMayActOnPackage } from "@/src/lib/package-producer-assignment";
import type { BrainstormProofView } from "@/src/lib/package-brainstorm";
import {
  checkInPointsForCycle,
  effectiveGroupApprovalStage,
  GROUP_NAV_SLUGS,
  GROUP_NAV_TAB_LABELS,
  groupNavTabDone,
  PACKAGE_STAGES,
  pendingGroupNavSlug,
  type GroupNavSlug,
  type PackageStage
} from "@/src/lib/package-stages";

export type CycleDates = Record<keyof GroupScheduleInput["dates"], string | null>;

export type CycleTab = {
  cycleNumber: number;
  focus: string;
  dates?: CycleDates;
};

export type GroupMember = {
  userId: string;
  name: string | null;
  email: string | null;
};

type AssignedProducer = {
  userId: string;
  name: string | null;
  email: string | null;
};

export type GroupRow = {
  reviewReadyAt?: Partial<Record<"brainstorming" | "a-roll" | "initial-cut", string | null>>;
  id?: string;
  groupMembers: string;
  groupTopic: string;
  groupType: string;
  category?: PackageCategory | null;
  assignedProducerUserId?: string | null;
  assignedProducer?: AssignedProducer | null;
  assignedExecutiveProducerUserId?: string | null;
  assignedExecutiveProducer?: AssignedProducer | null;
  memberUserIds?: string[];
  members?: GroupMember[];
  projectId?: string | null;
  initialCutMediaItemId?: string | null;
  finalCutMediaItemId?: string | null;
  pitching: boolean;
  proofOfContact: boolean;
  aRollBRoll: boolean;
  initialCut: boolean;
  initialCutManual?: boolean;
  finalCut: boolean;
  finalCutManual?: boolean;
  extension: boolean;
  extensionDays?: number;
  possibleInterviews?: string;
  possibleIdeas?: string;
  notes?: string;
  stageNotes?: Record<string, string> | null;
  revisedInitialCut?: boolean;
  brainstormDocUrl?: string;
  brainstormNeedsChanges?: boolean;
  proofs?: BrainstormProofView[];
  approvalStage?: string | null;
  remainingExecutiveSignoffs?: number | null;
  awaitingRevisedInitialCut?: boolean;
  initialCutVersionNumber?: number | null;
  initialCutNeedsRevisions?: boolean;
  initialCutReviewStage?: string | null;
  aRollHasMedia?: boolean;
  aRollNeedsChanges?: boolean;
  queuedForAir?: boolean;
  finalCutGraded?: boolean;
  finalCutGradesPublished?: boolean;
  finalCutScoredByUserIds?: string[];
};

export type GroupsPayload = {
  canEdit: boolean;
  activeCycleNumber: number;
  cycles: CycleTab[];
  rows: GroupRow[];
  producerCategory: PackageCategory | null;
  platformRole: PlatformRole | null;
  currentUserId: string;
};

export const STAGE_SHORT: Record<PackageStage, string> = {
  pitching: "Pitch",
  proofOfContact: "Contact",
  aRollBRoll: "A/B-roll",
  initialCut: "Initial",
  finalCut: "Final"
};

type StageSegmentState = "done" | "current" | "todo";

/** Everything a tile or a Progress row shows, computed once per render of the list. */
export type GroupRowView = {
  key: string;
  row: GroupRow;
  topic: string;
  href: string | null;
  pendingSlug: GroupNavSlug;
  pendingLabel: string;
  segments: Array<{ key: GroupNavSlug; label: string; state: StageSegmentState }>;
  attention: GroupAttention;
  tileStatus: GroupTileStatus;
  gradesPill: GroupTileStatus | null;
  schedule: GroupScheduleStatus | null;
  extensionLabel: string | null;
  checkIns: number;
  memberNames: string;
  apName: string;
  epName: string;
  contactLine: string;
  complete: boolean;
  canNotes: boolean;
  canApprovePitch: boolean;
};

type RowViewContext = {
  platformRole: PlatformRole | null;
  currentUserId: string;
  cycleDates: CycleDates | null;
  now: Date;
};

function memberLabel(member: GroupMember) {
  return member.name?.trim() || member.email || "Member";
}

function firstName(member: GroupMember) {
  const full = memberLabel(member);
  return full.split(/\s+/)[0] ?? full;
}

function producerDisplayName(producer: AssignedProducer | null | undefined) {
  if (!producer) return null;
  return producer.name?.trim() || producer.email || null;
}

function dateOrNull(value: string | null) {
  return value ? new Date(value) : null;
}

function isRowComplete(row: GroupRow) {
  return PACKAGE_STAGES.every((stage) => Boolean(row[stage]));
}

export function cycleHasDeadlines(dates: CycleDates | null | undefined) {
  return Boolean(dates && Object.values(dates).some(Boolean));
}

function scheduleFor(row: GroupRow, approvalStage: string, dates: CycleDates | null, now: Date) {
  if (!dates) return null;
  const state = { ...row, approvalStage };
  return groupScheduleStatus({
    dates: {
      pitching: dateOrNull(dates.pitching),
      proofOfContact: dateOrNull(dates.proofOfContact),
      aRollBRoll: dateOrNull(dates.aRollBRoll),
      initialCut: dateOrNull(dates.initialCut),
      finalCut: dateOrNull(dates.finalCut)
    },
    done: {
      pitching: row.pitching,
      proofOfContact: row.proofOfContact,
      aRollBRoll: row.aRollBRoll,
      initialStage1: groupNavTabDone("initial-stage-1", state),
      initialStage2: groupNavTabDone("initial-stage-2", state),
      initialStage3: groupNavTabDone("initial-stage-3", state),
      finalCut: row.finalCut
    },
    extensionDays: row.extensionDays ?? 0,
    now
  });
}

function tileStatusFor(row: GroupRow) {
  return groupTileStatus({
    reviewReadyAt: row.reviewReadyAt,
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    proofCount: row.proofs?.length ?? 0,
    brainstormDocUrl: row.brainstormDocUrl ?? "",
    brainstormNeedsChanges: Boolean(row.brainstormNeedsChanges),
    aRollBRoll: row.aRollBRoll,
    aRollHasMedia: Boolean(row.aRollHasMedia),
    aRollNeedsChanges: Boolean(row.aRollNeedsChanges),
    initialCutHasMedia: Boolean(row.initialCutMediaItemId),
    initialCutVersionNumber: row.initialCutVersionNumber ?? null,
    initialCutNeedsRevisions: Boolean(row.initialCutNeedsRevisions),
    awaitingRevisedInitialCut: Boolean(row.awaitingRevisedInitialCut),
    approvalStage: row.approvalStage ?? null,
    remainingExecutiveSignoffs: row.remainingExecutiveSignoffs,
    finalCutHasMedia: Boolean(row.finalCutMediaItemId),
    queuedForAir: Boolean(row.queuedForAir),
    finalCutGraded: Boolean(row.finalCutGraded)
  });
}

function gradesPillFor(row: GroupRow, ctx: RowViewContext) {
  const finalCutHasMedia = Boolean(row.finalCutMediaItemId);
  const pendingFromViewer = finalCutGradePendingFromViewer(ctx.platformRole, {
    finalCutHasMedia,
    finalCutGraded: Boolean(row.finalCutGraded),
    currentUserId: ctx.currentUserId,
    scoredByUserIds: row.finalCutScoredByUserIds
  });
  return finalCutGradesPill(pendingFromViewer, {
    finalCutHasMedia,
    gradesPublished: Boolean(row.finalCutGradesPublished)
  });
}

function extensionLabelFor(row: GroupRow, ctx: RowViewContext) {
  if (!row.extension) return null;
  const dueIn =
    ctx.cycleDates && !row.finalCut
      ? extensionDueIn(dateOrNull(ctx.cycleDates.finalCut), row.extensionDays ?? 0, ctx.now)
      : null;
  return extensionBadgeLabel(row.extensionDays, dueIn);
}

function contactLineFor(row: GroupRow) {
  return `Contact ${row.proofs?.length ?? 0}/3${row.brainstormDocUrl ? " · doc" : " · no doc"}${
    row.proofOfContact ? " · approved" : ""
  }`;
}

/** One helper for both views, so a group always opens the same pending stage. */
export function buildGroupRowView(row: GroupRow, index: number, ctx: RowViewContext): GroupRowView {
  const approvalStage = effectiveGroupApprovalStage(
    row.approvalStage,
    Boolean(row.initialCutNeedsRevisions),
    row.initialCutReviewStage
  );
  const navState = { ...row, approvalStage };
  const pendingSlug = pendingGroupNavSlug(navState);
  const segments = GROUP_NAV_SLUGS.map((slug) => {
    const done = groupNavTabDone(slug, navState);
    const state: StageSegmentState = done ? "done" : slug === pendingSlug ? "current" : "todo";
    return { key: slug, label: GROUP_NAV_TAB_LABELS[slug], state };
  });
  const members: GroupMember[] =
    row.members && row.members.length > 0
      ? row.members
      : (row.memberUserIds ?? []).map((userId) => ({ userId, name: null, email: null }));

  return {
    key: row.id ?? `row-${index}`,
    row,
    topic: row.groupTopic?.trim() || "Untitled package",
    href: row.id ? `/groups/${row.id}/${pendingSlug}` : null,
    pendingSlug,
    pendingLabel: GROUP_NAV_TAB_LABELS[pendingSlug],
    segments,
    attention: viewerAttention(ctx.platformRole, ctx.currentUserId, row),
    tileStatus: tileStatusFor(row),
    gradesPill: gradesPillFor(row, ctx),
    schedule: scheduleFor(row, approvalStage, ctx.cycleDates, ctx.now),
    extensionLabel: extensionLabelFor(row, ctx),
    checkIns: checkInPointsForCycle(row),
    memberNames: members.length === 0 ? "No members" : members.map(firstName).join(", "),
    apName: producerDisplayName(row.assignedProducer) ?? "—",
    epName: producerDisplayName(row.assignedExecutiveProducer) ?? "—",
    contactLine: contactLineFor(row),
    complete: isRowComplete(row),
    canNotes: Boolean(row.id) && producerMayActOnPackage(ctx.platformRole, ctx.currentUserId, { ...row, members }),
    canApprovePitch: canApprovePitchFromTile(ctx.platformRole, row)
  };
}

export type ExecutiveBucket = {
  key: string;
  executiveName: string | null;
  views: GroupRowView[];
  completeCount: number;
};

/** Progress buckets: one per assigned executive producer, sorted by name, Unassigned last. */
export function groupViewsByExecutive(views: GroupRowView[]): ExecutiveBucket[] {
  const buckets = new Map<string, { executive: AssignedProducer | null; views: GroupRowView[] }>();
  for (const view of views) {
    const key = view.row.assignedExecutiveProducerUserId ?? "unassigned";
    const existing = buckets.get(key);
    buckets.set(
      key,
      existing
        ? { ...existing, views: [...existing.views, view] }
        : { executive: view.row.assignedExecutiveProducer ?? null, views: [view] }
    );
  }
  return [...buckets.entries()]
    .sort(([, a], [, b]) => {
      if (!a.executive) return 1;
      if (!b.executive) return -1;
      return (producerDisplayName(a.executive) ?? "").localeCompare(producerDisplayName(b.executive) ?? "");
    })
    .map(([key, bucket]) => ({
      key,
      executiveName: producerDisplayName(bucket.executive),
      views: bucket.views,
      completeCount: bucket.views.filter((view) => view.complete).length
    }));
}

export function toSavePayload(row: GroupRow) {
  return {
    id: row.id,
    groupMembers: row.groupMembers ?? "",
    groupTopic: row.groupTopic ?? "",
    groupType: (row.groupType ?? "") as GroupRow["groupType"],
    category: row.category ?? null,
    assignedProducerUserId: row.assignedProducerUserId ?? null,
    assignedExecutiveProducerUserId: row.assignedExecutiveProducerUserId ?? null,
    memberUserIds: row.memberUserIds ?? [],
    projectId: row.projectId ?? null,
    initialCutMediaItemId: row.initialCutMediaItemId ?? null,
    finalCutMediaItemId: row.finalCutMediaItemId ?? null,
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    aRollBRoll: row.aRollBRoll,
    initialCut: row.initialCut,
    initialCutManual: row.initialCutManual ?? false,
    revisedInitialCut: row.revisedInitialCut ?? false,
    finalCut: row.finalCut,
    finalCutManual: row.finalCutManual ?? false,
    extension: row.extension,
    possibleInterviews: row.possibleInterviews ?? "",
    possibleIdeas: row.possibleIdeas ?? "",
    notes: row.notes ?? "",
    stageNotes: row.stageNotes ?? null
  };
}

/** Flips one Progress stage; Initial and Final also mark the flag as set by hand. */
export function toggleRowStage(row: GroupRow, stage: PackageStage): GroupRow {
  const patch: Partial<GroupRow> = { [stage]: !row[stage] };
  if (stage === "initialCut") patch.initialCutManual = true;
  else if (stage === "finalCut") patch.finalCutManual = true;
  return { ...row, ...patch };
}

/** A Progress save waiting to be sent: one cycle's full roster. */
export type QueuedSave = { cycleNumber: number; rows: GroupRow[] };

/**
 * Adds a cycle's roster to the save queue. Each save sends the cycle's full roster, so a cycle
 * keeps only its latest one, and a change in another cycle never replaces it.
 */
export function withQueuedSave(queue: QueuedSave[], next: QueuedSave): QueuedSave[] {
  return queue.some((save) => save.cycleNumber === next.cycleNumber)
    ? queue.map((save) => (save.cycleNumber === next.cycleNumber ? next : save))
    : [...queue, next];
}

export function hasQueuedSave(queue: QueuedSave[], cycleNumber: number) {
  return queue.some((save) => save.cycleNumber === cycleNumber);
}
