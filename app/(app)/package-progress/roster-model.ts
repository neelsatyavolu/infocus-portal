import { consecutiveGroupmateOverlaps } from "@/src/lib/consecutive-groupmates";
import { finalCutDeadlinePassed } from "@/src/lib/deadlines";
import { groupTileStatus, type GroupTileStatusTone } from "@/src/lib/group-tile-status";
import { extractMentionUserIds } from "@/src/lib/group-members";
import { extensionBadgeLabel, extensionDueIn } from "@/src/lib/package-extensions";
import { selectedAssignedProducerId } from "@/src/lib/package-producer-assignment";
import { effectiveGroupApprovalStage, pendingGroupNavSlug } from "@/src/lib/package-stages";

/** Pure roster helpers for /package-progress: types, row normalising, filters, counts and statuses. */

export type CycleDates = {
  pitching: string | null;
  proofOfContact: string | null;
  aRollBRoll: string | null;
  initialCut: string | null;
  finalCut: string | null;
};

export type CycleTab = {
  cycleNumber: number;
  focus: string;
  dates?: CycleDates;
};

export type AssignableProducer = {
  userId: string;
  name: string | null;
  email: string | null;
  category?: "NEWS" | "FEATURE" | "COMMENTARY" | null;
};

export type AssignedUser = {
  userId: string;
  name: string | null;
  email: string | null;
};

export type RosterUser = {
  id: string;
  name: string | null;
  email: string | null;
};

export type ProgressRow = {
  id?: string;
  /** Client-only key for a row that has no id yet (never sent to the API). */
  clientKey?: string;
  groupMembers: string;
  groupTopic: string;
  groupType: string;
  category?: "NEWS" | "FEATURE" | "COMMENTARY" | null;
  assignedProducerUserId?: string | null;
  assignedProducer?: AssignedUser | null;
  assignedExecutiveProducerUserId?: string | null;
  assignedExecutiveProducer?: AssignedUser | null;
  memberUserIds?: string[];
  members?: Array<{ userId: string; name: string | null; email: string | null }>;
  initialCutMediaItemId?: string | null;
  finalCutMediaItemId?: string | null;
  stageNotes?: Record<string, string> | null;
  revisedInitialCut?: boolean;
  pitching: boolean;
  proofOfContact: boolean;
  aRollBRoll: boolean;
  initialCut: boolean;
  initialCutManual: boolean;
  finalCut: boolean;
  finalCutManual: boolean;
  extension: boolean;
  possibleInterviews?: string;
  possibleIdeas?: string;
  notes?: string;
};

/**
 * Stage fields only the GET returns (the save response drops them). Kept in a separate map by row
 * id, read for the Stage column, never posted.
 */
export type RowStageFields = {
  reviewReadyAt?: Partial<Record<"brainstorming" | "a-roll" | "initial-cut", string | null>>;
  brainstormDocUrl?: string;
  brainstormNeedsChanges?: boolean;
  proofs?: unknown[];
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
  extensionDays?: number;
};

export type PayloadRow = ProgressRow & RowStageFields;

export type PackageProgressPayload = {
  canEdit: boolean;
  canAssignProducer?: boolean;
  activeCycleNumber: number;
  cycles: CycleTab[];
  producers?: AssignableProducer[];
  executives?: AssignableProducer[];
  previousTeammatesByUser?: Record<string, string[]>;
  rows: PayloadRow[];
};

export const DEFAULT_ROW: ProgressRow = {
  groupMembers: "",
  groupTopic: "",
  groupType: "",
  category: null,
  assignedProducerUserId: null,
  assignedProducer: null,
  assignedExecutiveProducerUserId: null,
  assignedExecutiveProducer: null,
  memberUserIds: [],
  initialCutMediaItemId: null,
  finalCutMediaItemId: null,
  stageNotes: null,
  revisedInitialCut: false,
  pitching: false,
  proofOfContact: false,
  aRollBRoll: false,
  initialCut: false,
  initialCutManual: false,
  finalCut: false,
  finalCutManual: false,
  extension: false,
  possibleInterviews: "",
  possibleIdeas: "",
  notes: ""
};

/** Prefer DB member links; fall back to mention ids embedded in groupMembers. */
export function normalizeProgressRow<T extends ProgressRow>(row: T): T {
  const fromTable = row.memberUserIds ?? [];
  const fromMentions = extractMentionUserIds(row.groupMembers ?? "");
  const memberUserIds = fromTable.length > 0 ? fromTable : fromMentions;
  return { ...row, memberUserIds };
}

/** Rows as compared for "dirty" checks: ids (and client keys) ignored. */
export function serializeRows(rows: ProgressRow[]) {
  return JSON.stringify(rows.map((row) => ({ ...row, id: undefined, clientKey: undefined })));
}

/** The row as posted to the API (no client-only key). */
export function withoutClientKey(row: ProgressRow): ProgressRow {
  return row.clientKey === undefined ? row : { ...row, clientKey: undefined };
}

/** Stage fields from the last GET, by row id. */
export function stageSnapshot(rows: PayloadRow[]): Map<string, PayloadRow> {
  return new Map(rows.filter((row) => row.id).map((row) => [row.id as string, row]));
}

/** Fetched people first, then every linked member the payload already names (so chips never go blank). */
export function mergeRosterUsers(fetched: RosterUser[], rows: ProgressRow[]): RosterUser[] {
  const seen = new Set(fetched.map((user) => user.id));
  const extra: RosterUser[] = [];
  for (const row of rows) {
    for (const member of row.members ?? []) {
      if (seen.has(member.userId)) continue;
      seen.add(member.userId);
      extra.push({ id: member.userId, name: member.name, email: member.email });
    }
  }
  return extra.length > 0 ? [...fetched, ...extra] : fetched;
}

export function firstNameOf(user: { name: string | null; email: string | null } | undefined) {
  const source = user?.name?.trim() || user?.email?.split("@")[0]?.trim() || "Someone";
  return source.split(/\s+/)[0] ?? source;
}

function fullNameOf(user: { name: string | null; email: string | null } | undefined) {
  return user?.name?.trim() || user?.email?.split("@")[0] || "Someone";
}

/**
 * "Same group last cycle: Abby T. and Otto R.; Sage M. and Rowan K.", each pair once, with
 * full names (two students can share a first name).
 */
export function consecutiveWarning(
  memberUserIds: string[],
  previousTeammatesByUser: Record<string, string[]>,
  usersById: Map<string, RosterUser>
): string | null {
  const overlaps = consecutiveGroupmateOverlaps(memberUserIds, previousTeammatesByUser);
  const seen = new Set<string>();
  const pairs: string[] = [];
  for (const overlap of overlaps) {
    for (const otherId of overlap.withUserIds) {
      const key = [overlap.userId, otherId].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(`${fullNameOf(usersById.get(overlap.userId))} and ${fullNameOf(usersById.get(otherId))}`);
    }
  }
  return pairs.length > 0 ? `Same group last cycle: ${pairs.join("; ")}` : null;
}

/* ---------- Producer ---------- */

export type ProducerKind = "AP" | "EP";

function resolveAssignedUser(
  assigned: AssignedUser | null | undefined,
  assignedUserId: string | null | undefined,
  pool: AssignableProducer[]
) {
  if (assigned) return assigned;
  if (!assignedUserId) return null;
  const match = pool.find((entry) => entry.userId === assignedUserId);
  return match ? { userId: match.userId, name: match.name, email: match.email } : null;
}

/** The assigned producer's name and AP/EP kind, or null when nobody (resolvable) is assigned. */
export function assignedProducerOf(
  row: ProgressRow,
  producers: AssignableProducer[],
  executives: AssignableProducer[]
): { userId: string; label: string; kind: ProducerKind | null } | null {
  const assigned =
    resolveAssignedUser(row.assignedExecutiveProducer, row.assignedExecutiveProducerUserId, executives) ??
    resolveAssignedUser(row.assignedProducer, row.assignedProducerUserId, producers);
  const label = assigned ? assigned.name?.trim() || assigned.email || null : null;
  if (!assigned || !label) return null;
  const kind = row.assignedExecutiveProducerUserId ? "EP" : row.assignedProducerUserId ? "AP" : null;
  return { userId: assigned.userId, label, kind };
}

export function hasProducer(row: ProgressRow) {
  return Boolean(row.assignedProducerUserId) || Boolean(row.assignedExecutiveProducerUserId);
}

export function hasMembers(row: ProgressRow) {
  return (row.memberUserIds?.length ?? 0) > 0 || row.groupMembers.trim().length > 0;
}

/* ---------- Stage status (read only; same helpers and words as the Groups tiles) ---------- */

export type RowStatus = {
  /** Groups page for this package (its pending stage), or null before the row is saved. */
  href: string | null;
  tile: { label: string; tone: GroupTileStatusTone };
  extension: string | null;
};

function dateOrNull(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function rowStatus(row: PayloadRow, cycleDates: CycleDates | null | undefined, now: Date): RowStatus {
  const pendingSlug = pendingGroupNavSlug({
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    aRollBRoll: row.aRollBRoll,
    finalCut: row.finalCut,
    approvalStage: effectiveGroupApprovalStage(
      row.approvalStage,
      Boolean(row.initialCutNeedsRevisions),
      row.initialCutReviewStage
    )
  });
  const tile = groupTileStatus(
    {
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
    },
    now.getTime()
  );
  const extension = row.extension
    ? extensionBadgeLabel(
        row.extensionDays,
        cycleDates && !row.finalCut
          ? extensionDueIn(dateOrNull(cycleDates.finalCut), row.extensionDays ?? 0, now)
          : null
      )
    : null;

  return {
    href: row.id ? `/groups/${row.id}/${pendingSlug}` : null,
    tile,
    extension
  };
}

/* ---------- Filters ---------- */

export const ROSTER_FILTERS = ["all", "no-producer", "no-members", "repeat", "mine"] as const;
export type RosterFilter = (typeof ROSTER_FILTERS)[number];

export const ROSTER_FILTER_LABELS: Record<RosterFilter, string> = {
  all: "All",
  "no-producer": "No producer",
  "no-members": "No members",
  repeat: "Same group last cycle",
  mine: "Assigned to me"
};

export function isRosterFilter(value: unknown): value is RosterFilter {
  return typeof value === "string" && (ROSTER_FILTERS as readonly string[]).includes(value);
}

export type FilterContext = {
  previousTeammatesByUser: Record<string, string[]>;
  viewerUserId: string | null;
};

export function matchesFilter(filter: RosterFilter, row: ProgressRow, context: FilterContext) {
  switch (filter) {
    case "all":
      return true;
    case "no-producer":
      return !hasProducer(row);
    case "no-members":
      return !hasMembers(row);
    case "repeat":
      return consecutiveGroupmateOverlaps(row.memberUserIds ?? [], context.previousTeammatesByUser).length > 0;
    case "mine":
      return Boolean(context.viewerUserId) && selectedAssignedProducerId(row) === context.viewerUserId;
  }
}

export function filterCounts(rows: ProgressRow[], context: FilterContext): Record<RosterFilter, number> {
  return Object.fromEntries(
    ROSTER_FILTERS.map((filter) => [filter, rows.filter((row) => matchesFilter(filter, row, context)).length])
  ) as Record<RosterFilter, number>;
}

/* ---------- Cycles ---------- */

function finalCutPassed(cycle: CycleTab, now: Date) {
  return finalCutDeadlinePassed(dateOrNull(cycle.dates?.finalCut), now);
}

/** Same rule as the server's activeCycleNumberFor: the first cycle whose Final Cut is still open, else the last. */
export function currentCycleNumber(cycles: CycleTab[], now: Date): number | null {
  if (cycles.length === 0) return null;
  const sorted = [...cycles].sort((a, b) => a.cycleNumber - b.cycleNumber);
  return sorted.find((cycle) => !finalCutPassed(cycle, now))?.cycleNumber ?? sorted[sorted.length - 1]?.cycleNumber ?? null;
}

export type CycleStatus = "active" | "planned" | "closed";

/** Active / Planned / Closed, the Cycle Dates vocabulary. Null for a later cycle with no Final Cut date yet. */
export function cycleStatus(cycle: CycleTab, current: number | null, now: Date): CycleStatus | null {
  if (finalCutPassed(cycle, now)) return "closed";
  if (cycle.cycleNumber === current) return "active";
  return cycle.dates?.finalCut ? "planned" : null;
}

const SPAN_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Sep 2 – Oct 3" from the Pitch date to the Final Cut date (stored as UTC days). */
export function cycleSpanLabel(cycle: CycleTab): string | null {
  const start = dateOrNull(cycle.dates?.pitching);
  const end = dateOrNull(cycle.dates?.finalCut);
  if (!start || !end) return null;
  return `${SPAN_FORMAT.format(start)} – ${SPAN_FORMAT.format(end)}`;
}

/** "03" — the roster's row number style. */
export function rowNumberLabel(index: number) {
  return String(index + 1).padStart(2, "0");
}
