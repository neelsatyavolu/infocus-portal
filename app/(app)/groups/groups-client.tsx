"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AssociatesDialog from "./associates-dialog";
import GroupNotesButton from "./group-notes-button";
import { producerMayActOnPackage } from "@/src/lib/package-producer-assignment";
import { ChevronDown, ChevronRight, ExternalLink, LayoutGrid, RefreshCcw, Table2 } from "lucide-react";
import type { PackageCategory, PlatformRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  GROUP_NAV_TAB_LABELS,
  GROUP_NAV_SLUGS,
  groupNavTabDone,
  MAX_CHECK_IN_POINTS_PER_CYCLE,
  PACKAGE_CATEGORY_LABELS,
  PACKAGE_STAGE_LABELS,
  PACKAGE_STAGES,
  checkInPointsForCycle,
  effectiveGroupApprovalStage,
  pendingGroupNavSlug,
  type PackageStage,
  type StageCompletion
} from "@/src/lib/package-stages";
import { cn } from "@/src/lib/utils";
import type { BrainstormProofView } from "@/src/lib/package-brainstorm";
import { filterGroupsForViewer, isPrimaryGroupForViewer } from "@/src/lib/groups-visibility";
import { groupTileStatus, groupTileStatusClass, groupViewerAttention } from "@/src/lib/group-tile-status";

type CycleTab = {
  cycleNumber: number;
  focus: string;
};

type GroupMember = {
  userId: string;
  name: string | null;
  email: string | null;
};

type AssignedProducer = {
  userId: string;
  name: string | null;
  email: string | null;
};

type GroupRow = {
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
  possibleInterviews?: string;
  possibleIdeas?: string;
  notes?: string;
  stageNotes?: Record<string, string> | null;
  revisedInitialCut?: boolean;
  brainstormDocUrl?: string;
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

type ViewMode = "cards" | "chart";

const STAGE_SHORT: Record<PackageStage, string> = {
  pitching: "Pitch",
  proofOfContact: "Contact",
  aRollBRoll: "A/B-roll",
  initialCut: "Initial",
  finalCut: "Final"
};

function memberLabel(member: GroupMember) {
  return member.name?.trim() || member.email || "Member";
}

function firstName(member: GroupMember) {
  const full = memberLabel(member);
  return full.split(/\s+/)[0] ?? full;
}

function rowHasContent(row: GroupRow) {
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

function producerDisplayName(producer: AssignedProducer | null | undefined) {
  if (!producer) return null;
  return producer.name?.trim() || producer.email || null;
}

function groupRowsByExecutive(rows: GroupRow[]) {
  const buckets = new Map<string, { executive: AssignedProducer | null; rows: GroupRow[] }>();

  for (const row of rows) {
    const key = row.assignedExecutiveProducerUserId ?? "unassigned";
    const existing = buckets.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    buckets.set(key, {
      executive: row.assignedExecutiveProducer ?? null,
      rows: [row]
    });
  }

  return [...buckets.values()].sort((a, b) => {
    if (!a.executive) return 1;
    if (!b.executive) return -1;
    return (producerDisplayName(a.executive) ?? "").localeCompare(producerDisplayName(b.executive) ?? "");
  });
}

function stageDone(row: GroupRow, stage: PackageStage) {
  return Boolean(row[stage]);
}

function rowCompletion(row: GroupRow): StageCompletion {
  return {
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    aRollBRoll: row.aRollBRoll,
    initialCut: row.initialCut,
    finalCut: row.finalCut
  };
}

function toSavePayload(row: GroupRow) {
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

async function fetchCycle(cycleNumber?: number) {
  const query = typeof cycleNumber === "number" ? `?cycle=${cycleNumber}` : "";
  const response = await fetch(`/api/package-progress${query}`, { cache: "no-store" });
  const payload = (await response.json()) as {
    data?: Omit<GroupsPayload, "producerCategory" | "platformRole" | "currentUserId">;
    error?: { message?: string };
  };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load groups.");
  }
  return payload.data;
}

function attentionFor(
  role: PlatformRole | null,
  currentUserId: string,
  row: Pick<
    GroupRow,
    | "approvalStage"
    | "finalCutMediaItemId"
    | "queuedForAir"
    | "finalCutScoredByUserIds"
    | "assignedProducerUserId"
    | "assignedExecutiveProducerUserId"
    | "proofOfContact"
    | "proofs"
    | "brainstormDocUrl"
    | "aRollBRoll"
    | "aRollHasMedia"
  >
) {
  return groupViewerAttention(role, row.approvalStage, {
    finalCutHasMedia: Boolean(row.finalCutMediaItemId),
    queuedForAir: Boolean(row.queuedForAir),
    currentUserId,
    scoredByUserIds: row.finalCutScoredByUserIds,
    assignedProducerUserId: row.assignedProducerUserId,
    assignedExecutiveProducerUserId: row.assignedExecutiveProducerUserId,
    proofOfContact: row.proofOfContact,
    proofCount: row.proofs?.length ?? 0,
    brainstormDocUrl: row.brainstormDocUrl ?? "",
    aRollBRoll: row.aRollBRoll,
    aRollHasMedia: Boolean(row.aRollHasMedia)
  });
}

function GroupTile({
  row,
  platformRole,
  currentUserId,
  onNotesSaved
}: {
  row: GroupRow;
  platformRole: PlatformRole | null;
  currentUserId: string;
  onNotesSaved: (rowId: string, value: string) => void;
}) {
  const completion = rowCompletion(row);
  const approvalStage = effectiveGroupApprovalStage(
    row.approvalStage,
    Boolean(row.initialCutNeedsRevisions),
    row.initialCutReviewStage
  );
  const pendingSlug = pendingGroupNavSlug({
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    aRollBRoll: row.aRollBRoll,
    finalCut: row.finalCut,
    approvalStage
  });
  const checkIns = checkInPointsForCycle(completion);
  const members =
    row.members && row.members.length > 0
      ? row.members
      : (row.memberUserIds ?? []).map((userId) => ({
          userId,
          name: null,
          email: null
        }));
  const tileStatus = groupTileStatus({
    reviewReadyAt: row.reviewReadyAt,
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    proofCount: row.proofs?.length ?? 0,
    brainstormDocUrl: row.brainstormDocUrl ?? "",
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
    queuedForAir: Boolean(row.queuedForAir)
  });
  const href = row.id ? (`/groups/${row.id}/${pendingSlug}` as const) : null;
  const attention = attentionFor(platformRole, currentUserId, row);
  const cardClassName = cn(
    "relative block rounded-xl border bg-card px-3.5 py-3 transition-colors hover:bg-white/[0.02]",
    attention === "needed"
      ? "border-[var(--brand-green)]/55 hover:border-[var(--brand-green)]/80"
      : "border-border hover:border-[var(--brand-green)]/45",
    attention === "waiting" && "opacity-80"
  );
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {href ? (
              <Link href={href as never} className="after:absolute after:inset-0 after:rounded-xl">
                {row.groupTopic?.trim() || "Untitled package"}
              </Link>
            ) : row.groupTopic?.trim() || "Untitled package"}
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {members.length === 0
              ? "No members"
              : members.map((member) => firstName(member)).join(", ")}
            <span className="mx-1.5 text-border">·</span>
            AP {producerDisplayName(row.assignedProducer) ?? "—"}
            <span className="mx-1.5 text-border">·</span>
            EP {producerDisplayName(row.assignedExecutiveProducer) ?? "—"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {row.id && producerMayActOnPackage(platformRole, currentUserId, {
            ...row,
            members
          }) ? (
            <GroupNotesButton rowId={row.id} topic={row.groupTopic} onSaved={(value) => onNotesSaved(row.id!, value)} />
          ) : null}
          <div className="shrink-0 text-right">
            <div className="text-[11px] font-semibold text-foreground">
              {GROUP_NAV_TAB_LABELS[pendingSlug]}
            </div>
            <div className="text-[10px] tabular-nums text-muted-foreground">
              {checkIns}/{MAX_CHECK_IN_POINTS_PER_CYCLE}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1">
        {GROUP_NAV_SLUGS.map((stage) => {
          const done = groupNavTabDone(stage, { ...row, approvalStage });
          const pending = stage === pendingSlug && !done;
          return (
            <span
              key={stage}
              title={GROUP_NAV_TAB_LABELS[stage]}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                done
                  ? "bg-[var(--brand-green)]"
                  : pending
                    ? "bg-[var(--brand-green)]/40"
                    : "bg-secondary"
              )}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {attention === "needed" ? (
          <span className="status-pill status-pill-sm status-warn">Needs you</span>
        ) : attention === "waiting" ? (
          <span className="status-pill status-pill-sm status-neutral">Not your stage</span>
        ) : null}
        <span className={cn("status-pill status-pill-sm", groupTileStatusClass(tileStatus.tone))}>
          {tileStatus.label}
        </span>
        {row.extension ? (
          <span className="rounded-full bg-amber-500/20 px-1.5 py-px text-[10px] font-medium text-amber-100">
            Extension
          </span>
        ) : null}
      </div>
    </>
  );

  return (
    <article className={cardClassName}>
      {body}
    </article>
  );
}

export default function GroupsClient({ initialData }: { initialData: GroupsPayload }) {
  const [cycles, setCycles] = useState(initialData.cycles);
  const [activeCycleNumber, setActiveCycleNumber] = useState(initialData.activeCycleNumber);
  const [rows, setRows] = useState(initialData.rows);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [otherGroupsOpen, setOtherGroupsOpen] = useState(false);

  const rowsRef = useRef(rows);
  const saveInFlightRef = useRef(false);
  const queuedRowsRef = useRef<GroupRow[] | null>(null);
  const activeCycleNumberRef = useRef(activeCycleNumber);

  const producerCategory = initialData.producerCategory;
  const platformRole = initialData.platformRole;
  const isAssociateOnly = platformRole === "ASSOCIATE_PRODUCER";
  const currentUserId = initialData.currentUserId;
  const canEdit = initialData.canEdit;

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    activeCycleNumberRef.current = activeCycleNumber;
  }, [activeCycleNumber]);

  useEffect(() => {
    if (hasHydrated) {
      setHasHydrated(false);
      return;
    }

    let active = true;
    async function load() {
      try {
        setLoading(true);
        setMessage(null);
        const data = await fetchCycle(activeCycleNumber);
        if (!active) return;
        setCycles(data.cycles);
        setActiveCycleNumber(data.activeCycleNumber);
        setRows(data.rows);
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Failed to load groups.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch on cycle change
  }, [activeCycleNumber]);

  const groups = useMemo(() => {
    const visible = filterGroupsForViewer(rows.filter(rowHasContent), {
      platformRole,
      currentUserId,
      producerCategory
    });
    if (platformRole !== "ADVISER" && platformRole !== "EXECUTIVE_PRODUCER" && platformRole !== "SUPER_ADMIN") {
      return visible;
    }
    return [...visible].sort((left, right) => {
      const leftNeeded = attentionFor(platformRole, currentUserId, left) === "needed" ? 0 : 1;
      const rightNeeded = attentionFor(platformRole, currentUserId, right) === "needed" ? 0 : 1;
      return leftNeeded - rightNeeded;
    });
  }, [rows, platformRole, producerCategory, currentUserId]);

  const stats = useMemo(() => {
    const total = groups.length;
    const done = groups.filter((g) => PACKAGE_STAGES.every((s) => stageDone(g, s))).length;
    const needsYou = groups.filter((g) => attentionFor(platformRole, currentUserId, g) === "needed").length;
    return { total, done, needsYou };
  }, [groups, platformRole, currentUserId]);

  const primaryGroups = useMemo(
    () =>
      groups.filter((row) =>
        isPrimaryGroupForViewer(row, { currentUserId, platformRole })
      ),
    [groups, currentUserId, platformRole]
  );
  const otherGroups = useMemo(
    () =>
      groups.filter(
        (row) => !isPrimaryGroupForViewer(row, { currentUserId, platformRole })
      ),
    [groups, currentUserId, platformRole]
  );

  const executiveGroups = useMemo(() => groupRowsByExecutive(groups), [groups]);

  const stageTotals = useMemo(() => {
    return PACKAGE_STAGES.map((stage) => ({
      stage,
      count: groups.filter((g) => stageDone(g, stage)).length
    }));
  }, [groups]);

  const activeCycle = cycles.find((c) => c.cycleNumber === activeCycleNumber) ?? null;

  async function flushSaves() {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);

    while (queuedRowsRef.current) {
      const nextRows = queuedRowsRef.current;
      queuedRowsRef.current = null;
      const cycleNumber = activeCycleNumberRef.current;

      try {
        setMessage(null);
        const response = await fetch("/api/package-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cycleNumber,
            // Always save the full cycle roster so filtered AP views never delete other groups.
            rows: nextRows.map(toSavePayload)
          })
        });
        const payload = (await response.json()) as {
          data?: { cycleNumber: number; rows: GroupRow[] };
          error?: { message?: string };
        };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "Failed to save stage progress.");
        }
        if (activeCycleNumberRef.current === cycleNumber) {
          setRows(payload.data.rows);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Failed to save stage progress.");
      }
    }

    saveInFlightRef.current = false;
    if (queuedRowsRef.current) {
      void flushSaves();
      return;
    }
    setSaving(false);
  }

  function queueSave(nextRows: GroupRow[]) {
    queuedRowsRef.current = nextRows;
    void flushSaves();
  }

  function toggleStage(rowId: string | undefined, stage: PackageStage) {
    if (!canEdit || !rowId) return;

    const nextRows = rowsRef.current.map((row) => {
      if (row.id !== rowId) return row;
      const done = Boolean(row[stage]);
      const patch: Partial<GroupRow> = { [stage]: !done };
      if (stage === "initialCut") {
        patch.initialCutManual = true;
      } else if (stage === "finalCut") {
        patch.finalCutManual = true;
      }
      return { ...row, ...patch };
    });

    setRows(nextRows);
    queueSave(nextRows);
  }

  function updateNotes(rowId: string, possibleIdeas: string) {
    const update = (items: GroupRow[]) => items.map((row) => row.id === rowId ? { ...row, possibleIdeas } : row);
    rowsRef.current = update(rowsRef.current);
    setRows((current) => update(current));
    if (queuedRowsRef.current) queuedRowsRef.current = update(queuedRowsRef.current);
  }

  async function refresh() {
    try {
      setMessage(null);
      setLoading(true);
      const data = await fetchCycle(activeCycleNumber);
      setCycles(data.cycles);
      setRows(data.rows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to refresh.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="route-enter mx-auto w-full max-w-[80rem] space-y-3 pb-24">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-4 md:px-5">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Producer view</div>
            <h1 className="display-md mt-1 text-balance text-foreground">Groups</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {viewMode === "cards"
                ? "Open a group to work its current stage."
                : "Stage track for every visible group."}
              {isAssociateOnly && producerCategory
                ? ` ${PACKAGE_CATEGORY_LABELS[producerCategory]}.`
                : ""}
              {activeCycle?.focus?.trim() ? ` ${activeCycle.focus}.` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="meta-pill">
              {stats.total} group{stats.total === 1 ? "" : "s"}
              {stats.needsYou > 0 ? ` · ${stats.needsYou} need you` : ""}
              {stats.done > 0 ? ` · ${stats.done} done` : ""}
            </span>
            <div className="inline-flex items-center rounded-lg border border-border bg-black/40 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  viewMode === "cards"
                    ? "bg-[var(--brand-green)] text-[var(--ink)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Tiles
              </button>
              <button
                type="button"
                onClick={() => setViewMode("chart")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  viewMode === "chart"
                    ? "bg-[var(--brand-green)] text-[var(--ink)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Table2 className="h-3.5 w-3.5" />
                Progress
              </button>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => void refresh()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            {(platformRole === "EXECUTIVE_PRODUCER" || platformRole === "ADVISER" || platformRole === "SUPER_ADMIN") && (
              <AssociatesDialog cycles={cycles} activeCycleNumber={activeCycleNumber} />
            )}
            <Link
              href={"/package-progress" as never}
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              <ExternalLink className="h-4 w-4" />
              Edit roster
            </Link>
          </div>
        </div>

        {viewMode === "chart" && stats.total > 0 ? (
          <div className="relative mt-3 flex flex-wrap gap-2">
            {stageTotals.map(({ stage, count }) => {
              const pct = Math.round((count / stats.total) * 100);
              return (
                <div
                  key={stage}
                  className="min-w-[7.5rem] flex-1 rounded-lg border border-border/70 bg-black/35 px-2.5 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {STAGE_SHORT[stage]}
                    </span>
                    <span className="font-mono-broadcast text-[11px] font-semibold tabular-nums text-foreground">
                      {count}/{stats.total}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-[var(--brand-green)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {saving ? (
          <p className="relative mt-3 text-xs text-muted-foreground">Saving stage changes…</p>
        ) : viewMode === "chart" && canEdit ? (
          <p className="relative mt-3 text-xs text-muted-foreground">
            Click a stage to mark complete or incomplete. Changes save automatically.
          </p>
        ) : null}

        {message ? (
          <p className="relative mt-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        {loading ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Loading groups…
          </p>
        ) : groups.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            No groups with content in this cycle yet. Assign members, topics, and producers in{" "}
            <Link href={"/package-progress" as never} className="text-foreground underline">
              Package Cycle
            </Link>
            .
          </p>
        ) : viewMode === "cards" ? (
          <div className="space-y-3">
            {primaryGroups.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {primaryGroups.map((row, index) => (
                  <GroupTile
                    key={row.id ?? `primary-${index}`}
                    row={row}
                    platformRole={platformRole}
                    currentUserId={currentUserId}
                    onNotesSaved={updateNotes}
                  />
                ))}
              </div>
            ) : null}
            {otherGroups.length > 0 ? (
              <section className="space-y-2">
                <button
                  type="button"
                  onClick={() => setOtherGroupsOpen((open) => !open)}
                  className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-white/[0.02]"
                >
                  {otherGroupsOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>Other groups</span>
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {otherGroups.length}
                  </span>
                </button>
                {otherGroupsOpen ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {otherGroups.map((row, index) => (
                      <GroupTile
                        key={row.id ?? `other-${index}`}
                        row={row}
                        platformRole={platformRole}
                        currentUserId={currentUserId}
                        onNotesSaved={updateNotes}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {executiveGroups.map((bucket) => {
              const completeCount = bucket.rows.filter((row) =>
                PACKAGE_STAGES.every((stage) => stageDone(row, stage))
              ).length;
              const executiveName = producerDisplayName(bucket.executive);

              return (
                <section
                  key={bucket.executive?.userId ?? "unassigned"}
                  className="overflow-hidden rounded-2xl border border-border bg-card"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-[hsl(var(--background))] px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Executive producer
                      </div>
                      <h2 className="truncate text-sm font-semibold text-foreground">
                        {executiveName ?? "Unassigned"}
                      </h2>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {bucket.rows.length} package{bucket.rows.length === 1 ? "" : "s"}
                      {completeCount > 0 ? ` · ${completeCount} complete` : ""}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse">
                      <thead>
                        <tr>
                          {["Package", "Associate", "Stages", "Check-ins"].map((label) => (
                            <th
                              key={label}
                              className="px-3 py-2 text-left font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bucket.rows.map((row, index) => {
                          const members =
                            row.members && row.members.length > 0
                              ? row.members
                              : (row.memberUserIds ?? []).map((userId) => ({
                                  userId,
                                  name: null,
                                  email: null
                                }));
                          const checkIns = checkInPointsForCycle({
                            pitching: row.pitching,
                            proofOfContact: row.proofOfContact,
                            aRollBRoll: row.aRollBRoll,
                            initialCut: row.initialCut
                          });

                          return (
                            <tr
                              key={row.id ?? `chart-${bucket.executive?.userId ?? "unassigned"}-${index}`}
                              className="border-t border-[hsl(var(--border))]/40 bg-black transition-colors hover:bg-[var(--ink-2)] hover:shadow-[inset_3px_0_0_0_var(--brand-green)]"
                            >
                              <td className="min-w-[200px] px-3 py-2.5 align-middle">
                                <div className="text-sm font-semibold text-foreground">
                                  {row.id ? (
                                    <Link
                                      href={`/groups/${row.id}/${pendingGroupNavSlug({
                                        pitching: row.pitching,
                                        proofOfContact: row.proofOfContact,
                                        aRollBRoll: row.aRollBRoll,
                                        finalCut: row.finalCut,
                                        approvalStage: row.approvalStage ?? "DRAFT"
                                      })}` as never}
                                      className="hover:text-[var(--brand-green)]"
                                    >
                                      {row.groupTopic?.trim() || "Untitled package"}
                                    </Link>
                                  ) : (
                                    row.groupTopic?.trim() || "Untitled package"
                                  )}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {members.length === 0 ? (
                                    <span className="text-[11px] text-muted-foreground">No members</span>
                                  ) : (
                                    members.map((member) => (
                                      <span
                                        key={member.userId}
                                        className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                                      >
                                        {firstName(member)}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </td>
                              <td className="w-[140px] px-3 py-2.5 align-middle text-xs text-muted-foreground">
                                {producerDisplayName(row.assignedProducer) ?? "—"}
                              </td>
                              <td className="min-w-[280px] px-3 py-2.5 align-middle">
                                <div className="space-y-2">
                                  <div className="flex overflow-hidden rounded-md border border-border">
                                    {PACKAGE_STAGES.map((stage) => {
                                      const done = stageDone(row, stage);
                                      const mediaHint =
                                        stage === "initialCut" && row.initialCutMediaItemId
                                          ? " · media linked"
                                          : stage === "finalCut" && row.finalCutMediaItemId
                                            ? " · media linked"
                                            : "";
                                      return (
                                        <button
                                          key={stage}
                                          type="button"
                                          disabled={!canEdit || !row.id}
                                          title={`${PACKAGE_STAGE_LABELS[stage]}${mediaHint}`}
                                          onClick={() => toggleStage(row.id, stage)}
                                          className={cn(
                                            "flex-1 px-1 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide transition",
                                            done
                                              ? "bg-[var(--brand-green)] text-[var(--ink)]"
                                              : "bg-transparent text-muted-foreground hover:bg-white/5",
                                            canEdit && row.id ? "cursor-pointer" : "cursor-default"
                                          )}
                                        >
                                          {STAGE_SHORT[stage]}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    Contact {row.proofs?.length ?? 0}/3
                                    {row.brainstormDocUrl ? " · doc" : " · no doc"}
                                    {row.proofOfContact ? " · approved" : ""}
                                  </div>
                                </div>
                              </td>
                              <td className="w-[88px] px-3 py-2.5 align-middle text-xs font-semibold tabular-nums text-foreground">
                                {checkIns}
                                <span className="text-muted-foreground">/{MAX_CHECK_IN_POINTS_PER_CYCLE}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>

      <section className="sticky bottom-4 z-20 mx-auto flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-black/85 p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur">
          {cycles.map((cycle) => {
            const active = cycle.cycleNumber === activeCycleNumber;
            return (
              <button
                key={cycle.cycleNumber}
                type="button"
                onClick={() => setActiveCycleNumber(cycle.cycleNumber)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.18em] transition",
                  active
                    ? "bg-[var(--brand-green)] text-[var(--ink)]"
                    : "text-[var(--ink-text)] hover:bg-white/5 hover:text-white"
                )}
              >
                Cycle
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono-broadcast text-[10px] font-bold",
                    active ? "bg-black/35 text-[var(--ink)]" : "bg-black/40 text-[var(--ink-text)]"
                  )}
                >
                  {String(cycle.cycleNumber).padStart(2, "0")}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
