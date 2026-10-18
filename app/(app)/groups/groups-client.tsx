"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ListChecks, Users } from "lucide-react";
import type { PlatformRole } from "@prisma/client";
import { Alert } from "@/components/kit/alert";
import { cycleLabel } from "@/components/kit/format";
import { useListHotkeys } from "@/components/kit/hotkeys";
import type { MenuEntry } from "@/components/kit/menu";
import { SaveState, StatusTag } from "@/components/kit/status-tag";
import { visibleGroupRows } from "@/components/groups/group-attention";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { isPrimaryGroupForViewer } from "@/src/lib/groups-visibility";
import { writeGroupOrder } from "@/src/lib/keyboard-nav";
import { PACKAGE_CATEGORY_LABELS, PACKAGE_STAGES, type PackageStage } from "@/src/lib/package-stages";
import { requestNavStatusRefresh } from "@/src/lib/sidebar-nav";
import { cn } from "@/src/lib/utils";
import AssociatesDialog from "./associates-dialog";
import { GroupProgressSkeleton, GroupProgressView } from "./group-progress-view";
import {
  buildGroupRowView,
  cycleHasDeadlines,
  groupViewsByExecutive,
  hasQueuedSave,
  STAGE_SHORT,
  toggleRowStage,
  toSavePayload,
  withQueuedSave,
  type CycleTab,
  type GroupRow,
  type GroupRowView,
  type GroupsPayload,
  type QueuedSave
} from "./group-row-model";
import { GroupsTilesSkeleton, GroupsTilesView, NoGroupsState, type TileSections } from "./groups-tiles-view";
import { GroupsToolbar, type GroupsFilter } from "./groups-toolbar";
import { useGroupsPrefs } from "./use-groups-prefs";

export type { GroupsPayload } from "./group-row-model";

type CycleSnapshot = { cycles: CycleTab[]; rows: GroupRow[] };
type PageMessage = { text: string; retry: boolean };

const EXECUTIVE_ROLES = new Set<PlatformRole>(["ADVISER", "EXECUTIVE_PRODUCER", "SUPER_ADMIN"]);
/** How often time-based tags ("Behind by 2d", "Due in 5H") are recomputed while the page is open. */
const CLOCK_TICK_MS = 60_000;

function cycleCacheKey(cycleNumber: number) {
  return `groups:cycle:${cycleNumber}`;
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

/** The sidebar's Groups count (Needs you) is server-side; ask it to refetch after a change here. */
function refreshSidebarCount() {
  requestNavStatusRefresh(["groups"]);
}

/** Group links on screen (hidden duplicates, such as the other Progress layout, are skipped). */
function visibleGroupLinks(container: HTMLElement | null) {
  return Array.from(container?.querySelectorAll<HTMLAnchorElement>("a[data-group-tile]") ?? []).filter(
    (link) => link.getClientRects().length > 0
  );
}

function rememberGroupOrder(ids: string[]) {
  try {
    writeGroupOrder(window.sessionStorage, ids);
  } catch {
    // sessionStorage blocked: Previous/Next on group pages just won't show.
  }
}

export default function GroupsClient({ initialData }: { initialData: GroupsPayload }) {
  const { producerCategory, platformRole, currentUserId, canEdit } = initialData;
  const currentCycle = initialData.activeCycleNumber;
  const isAssociate = platformRole === "ASSOCIATE_PRODUCER";
  const isExecutiveRole = platformRole !== null && EXECUTIVE_ROLES.has(platformRole);

  const [cycles, setCycles] = useState(initialData.cycles);
  const [activeCycleNumber, setActiveCycleNumber] = useState(initialData.activeCycleNumber);
  const [rows, setRows] = useState(initialData.rows);
  // The cycle `rows` belong to. It trails activeCycleNumber while a cycle that isn't cached loads.
  const [rowsCycle, setRowsCycle] = useState(initialData.activeCycleNumber);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<PageMessage | null>(null);
  const [filter, setFilter] = useState<GroupsFilter>("all");
  const [associatesOpen, setAssociatesOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { viewMode, setViewMode, otherOpen, setOtherOpen, lastCycle, setLastCycle, lastCycleLoaded } = useGroupsPrefs();

  const rowsRef = useRef(rows);
  const activeCycleNumberRef = useRef(activeCycleNumber);
  const saveInFlightRef = useRef(false);
  // The cycle of the save being sent right now (null when none).
  const sendingCycleRef = useRef<number | null>(null);
  // Saves waiting to be sent, at most one per cycle, oldest first.
  const queuedSavesRef = useRef<QueuedSave[]>([]);
  const loadSeqRef = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  // The phone ⋯ trigger, and whichever control opened Associates (focus goes back there on close).
  const phoneMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const associatesOpenerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Keep a copy per cycle for this tab, so switching back to a cycle shows it at once.
  useEffect(() => {
    rememberValue<CycleSnapshot>(cycleCacheKey(rowsCycle), { cycles, rows });
  }, [cycles, rows, rowsCycle]);

  const loadCycle = useCallback(async (cycleNumber: number, mode: "switch" | "refresh") => {
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    setFetching(true);
    setMessage(null);
    try {
      const data = await fetchCycle(cycleNumber);
      if (seq !== loadSeqRef.current) return;
      // A cycle switch adopts the cycle the server answered with; Refresh keeps the current one.
      const resolved = mode === "switch" ? data.activeCycleNumber : cycleNumber;
      activeCycleNumberRef.current = resolved;
      setActiveCycleNumber(resolved);
      setCycles(data.cycles);
      // A stage save for this cycle is still on its way: its response brings newer rows than this
      // read. (The rows on screen are that cycle's: a save implies they were shown, and switching
      // back restores them from the tab cache before this load starts.)
      const savePending = sendingCycleRef.current === resolved || hasQueuedSave(queuedSavesRef.current, resolved);
      if (!savePending) setRows(data.rows);
      setRowsCycle(resolved);
      if (mode === "refresh") refreshSidebarCount();
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      const fallback = mode === "switch" ? "Failed to load groups." : "Failed to refresh.";
      setMessage({ text: error instanceof Error ? error.message : fallback, retry: true });
    } finally {
      if (seq === loadSeqRef.current) setFetching(false);
    }
  }, []);

  function selectCycle(next: number) {
    setLastCycle(next);
    if (next === activeCycleNumberRef.current) return;
    activeCycleNumberRef.current = next;
    setActiveCycleNumber(next);
    const cached = cachedValue<CycleSnapshot>(cycleCacheKey(next));
    if (cached) {
      setCycles(cached.cycles);
      setRows(cached.rows);
      setRowsCycle(next);
    }
    void loadCycle(next, "switch");
  }

  // Open on the cycle last picked in this browser, if it still exists (adjusted during render; the
  // effect below loads it).
  const [cycleRestoreChecked, setCycleRestoreChecked] = useState(false);
  const [restoredCycle, setRestoredCycle] = useState<number | null>(null);
  if (lastCycleLoaded && !cycleRestoreChecked) {
    setCycleRestoreChecked(true);
    if (lastCycle !== null && lastCycle !== activeCycleNumber && cycles.some((c) => c.cycleNumber === lastCycle)) {
      setActiveCycleNumber(lastCycle);
      setRestoredCycle(lastCycle);
    }
  }

  useEffect(() => {
    if (restoredCycle === null) return;
    activeCycleNumberRef.current = restoredCycle;
    async function load(cycleNumber: number) {
      await loadCycle(cycleNumber, "switch");
    }
    void load(restoredCycle);
  }, [restoredCycle, loadCycle]);

  function refresh() {
    void loadCycle(activeCycleNumberRef.current, "refresh");
  }

  function openAssociates(opener: HTMLElement | null) {
    associatesOpenerRef.current = opener;
    setAssociatesOpen(true);
  }

  async function flushSaves() {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);

    while (queuedSavesRef.current.length > 0) {
      const [{ cycleNumber, rows: nextRows }, ...rest] = queuedSavesRef.current;
      queuedSavesRef.current = rest;
      sendingCycleRef.current = cycleNumber;

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
        // A newer change to this cycle is already queued: its response will bring the rows, so don't flash back.
        if (activeCycleNumberRef.current === cycleNumber && !hasQueuedSave(queuedSavesRef.current, cycleNumber)) {
          setRows(payload.data.rows);
          setRowsCycle(cycleNumber);
        }
        refreshSidebarCount();
      } catch (error) {
        setMessage({ text: error instanceof Error ? error.message : "Failed to save stage progress.", retry: false });
      }
    }

    sendingCycleRef.current = null;
    saveInFlightRef.current = false;
    if (queuedSavesRef.current.length > 0) {
      void flushSaves();
      return;
    }
    setSaving(false);
  }

  function toggleStage(rowId: string | undefined, stage: PackageStage) {
    // While fresh rows load (a cycle switch can show a cached copy), a save would send a stale roster.
    if (!canEdit || !rowId || fetching) return;
    const nextRows = rowsRef.current.map((row) => (row.id === rowId ? toggleRowStage(row, stage) : row));
    rowsRef.current = nextRows;
    setRows(nextRows);
    queuedSavesRef.current = withQueuedSave(queuedSavesRef.current, {
      cycleNumber: activeCycleNumberRef.current,
      rows: nextRows
    });
    void flushSaves();
  }

  /** Local edits from Notes and Approve pitch, kept in any queued save too (row ids are unique across cycles). */
  const patchRow = useCallback((rowId: string, patch: Partial<GroupRow>) => {
    const update = (items: GroupRow[]) => items.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
    rowsRef.current = update(rowsRef.current);
    setRows((current) => update(current));
    queuedSavesRef.current = queuedSavesRef.current.map((save) => ({ ...save, rows: update(save.rows) }));
  }, []);

  const tileHandlers = useMemo(
    () => ({
      onNotesSaved: (rowId: string, possibleIdeas: string) => patchRow(rowId, { possibleIdeas }),
      onPitchApproved: (rowId: string) => {
        patchRow(rowId, { pitching: true });
        refreshSidebarCount();
      }
    }),
    [patchRow]
  );

  const awaitingRows = rowsCycle !== activeCycleNumber;
  const activeCycle = cycles.find((cycle) => cycle.cycleNumber === activeCycleNumber) ?? null;
  const rowsCycleDates = cycles.find((cycle) => cycle.cycleNumber === rowsCycle)?.dates ?? null;

  const views = useMemo(() => {
    const context = { platformRole, currentUserId, cycleDates: rowsCycleDates, now: new Date(now) };
    const built = visibleGroupRows(rows, { platformRole, currentUserId, producerCategory }).map((row, index) =>
      buildGroupRowView(row, index, context)
    );
    // Executives and the adviser see their queue first everywhere (Progress buckets too).
    if (!isExecutiveRole) return built;
    return [...built].sort((a, b) => (a.attention === "needed" ? 0 : 1) - (b.attention === "needed" ? 0 : 1));
  }, [rows, rowsCycleDates, now, platformRole, currentUserId, producerCategory, isExecutiveRole]);

  const stats = useMemo(
    () => ({
      total: views.length,
      done: views.filter((view) => view.complete).length,
      needsYou: views.filter((view) => view.attention === "needed").length,
      behind: views.filter((view) => (view.schedule?.daysBehind ?? 0) > 0).length
    }),
    [views]
  );

  const sections = useMemo<TileSections>(() => {
    const viewer = { currentUserId, platformRole };
    const matches = (view: GroupRowView) =>
      filter === "all" ||
      (filter === "needs-you" ? view.attention === "needed" : (view.schedule?.daysBehind ?? 0) > 0);
    const primary = views.filter((view) => isPrimaryGroupForViewer(view.row, viewer));
    return {
      needsYou: primary.filter((view) => view.attention === "needed" && matches(view)),
      assigned: primary.filter((view) => view.attention !== "needed" && matches(view)),
      other: views.filter((view) => !isPrimaryGroupForViewer(view.row, viewer) && matches(view))
    };
  }, [views, filter, currentUserId, platformRole]);

  const buckets = useMemo(() => groupViewsByExecutive(views), [views]);
  const stageTotals = useMemo(
    () =>
      PACKAGE_STAGES.map((stage) => ({
        key: stage,
        label: STAGE_SHORT[stage],
        count: views.filter((view) => view.row[stage]).length
      })),
    [views]
  );

  // Save the order on screen so a group's page can step to the previous or next one.
  const orderKey = useMemo(() => {
    if (awaitingRows) return null;
    // A filter shows Other expanded (see GroupsTilesView), whatever the remembered fold.
    const otherShown = otherOpen || filter !== "all";
    const shown =
      viewMode === "chart"
        ? buckets.flatMap((bucket) => bucket.views)
        : [...sections.needsYou, ...sections.assigned, ...(otherShown ? sections.other : [])];
    return shown
      .map((view) => view.row.id)
      .filter((id): id is string => Boolean(id))
      .join(",");
  }, [awaitingRows, viewMode, buckets, sections, otherOpen, filter]);

  useEffect(() => {
    if (orderKey === null) return;
    rememberGroupOrder(orderKey ? orderKey.split(",") : []);
  }, [orderKey]);

  // J / K move focus between groups (tiles or Progress rows); Enter opens the focused one.
  function moveFocus(delta: 1 | -1) {
    // An open select or menu list keeps its own typing (J/K typeahead).
    if (document.activeElement?.closest('[role="listbox"], [role="menu"]')) return;
    const links = visibleGroupLinks(boardRef.current);
    if (links.length === 0) return;
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = current === -1 ? 0 : Math.min(links.length - 1, Math.max(0, current + delta));
    links[next]?.focus();
    links[next]?.scrollIntoView({ block: "nearest" });
  }
  useListHotkeys({ onNext: () => moveFocus(1), onPrevious: () => moveFocus(-1) });

  const hasDeadlines = cycleHasDeadlines(rowsCycleDates);
  // Needs you is for executives, the adviser and super admin (associates are never "needed").
  const filterOptions = [
    { value: "all" as const, label: "All", count: stats.total },
    {
      value: "needs-you" as const,
      label: "Needs you",
      count: stats.needsYou,
      tone: stats.needsYou > 0 ? ("warning" as const) : undefined,
      hidden: !isExecutiveRole
    },
    {
      value: "behind" as const,
      label: "Behind",
      count: stats.behind,
      tone: stats.behind > 0 ? ("danger" as const) : undefined,
      hidden: !hasDeadlines
    }
  ];

  const showFilters =
    viewMode === "cards" && !awaitingRows && stats.total > 0 && filterOptions.filter((option) => !option.hidden).length > 1;
  const noGroups = !awaitingRows && stats.total === 0;

  const focus = activeCycle?.focus?.trim();
  const description = (
    awaitingRows
      ? [focus]
      : [
          focus,
          `${stats.total} group${stats.total === 1 ? "" : "s"}`,
          stats.done > 0 ? `${stats.done} done` : null,
          isAssociate && producerCategory ? PACKAGE_CATEGORY_LABELS[producerCategory] : null
        ]
  )
    .filter(Boolean)
    .join(" · ");

  // The empty state has its own "Open Package Cycle" button, so the header drops its copy then.
  const phoneMenu: MenuEntry[] = [
    {
      key: "associates",
      label: "Associates",
      icon: Users,
      onSelect: () => openAssociates(phoneMenuTriggerRef.current),
      hidden: !isExecutiveRole
    },
    { key: "roster", label: "Open Package Cycle", icon: ListChecks, href: "/package-progress", hidden: noGroups }
  ];

  // Phones get these from the toolbar's ⋯ menu instead.
  const headerActions =
    isExecutiveRole || !noGroups ? (
      <>
        {isExecutiveRole ? (
          <Button
            type="button"
            variant="outline"
            className="max-sm:hidden"
            onClick={(event) => openAssociates(event.currentTarget)}
          >
            <Users aria-hidden />
            Associates
          </Button>
        ) : null}
        {noGroups ? null : (
          <Link href={"/package-progress" as never} className={cn(buttonVariants({ variant: "outline" }), "max-sm:hidden")}>
            <ListChecks aria-hidden />
            Open Package Cycle
          </Link>
        )}
      </>
    ) : undefined;

  let content: ReactNode = null;
  if (awaitingRows) {
    if (fetching) content = viewMode === "chart" ? <GroupProgressSkeleton canEdit={canEdit} /> : <GroupsTilesSkeleton />;
  } else if (noGroups) {
    content = <NoGroupsState cycleNumber={activeCycleNumber} />;
  } else if (viewMode === "chart") {
    content = (
      <GroupProgressView
        buckets={buckets}
        totals={stageTotals}
        total={stats.total}
        canEdit={canEdit}
        locked={fetching}
        onToggle={toggleStage}
      />
    );
  } else {
    content = (
      <GroupsTilesView
        sections={sections}
        cycleNumber={activeCycleNumber}
        isAssociate={isAssociate}
        filter={filter}
        onShowAll={() => setFilter("all")}
        otherOpen={otherOpen}
        onToggleOther={() => setOtherOpen((open) => !open)}
        handlers={tileHandlers}
      />
    );
  }

  return (
    <div ref={boardRef} className="route-enter space-y-5">
      <PageHeader
        eyebrow={`Producer view · ${cycleLabel(activeCycleNumber)}`}
        status={
          <>
            {isExecutiveRole && !awaitingRows && stats.needsYou > 0 ? (
              <StatusTag tone="warning">{`${stats.needsYou} need${stats.needsYou === 1 ? "s" : ""} you`}</StatusTag>
            ) : null}
            <SaveState state={saving ? "saving" : "idle"} />
          </>
        }
        title="Groups"
        description={description || undefined}
        className="max-sm:gap-y-0"
        actions={headerActions}
      />

      <GroupsToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filter={filter}
        onFilterChange={setFilter}
        filterOptions={filterOptions}
        showFilters={showFilters}
        cycles={cycles}
        activeCycleNumber={activeCycleNumber}
        currentCycle={currentCycle}
        onCycleChange={selectCycle}
        refreshing={fetching}
        onRefresh={refresh}
        phoneMenu={phoneMenu}
        phoneMenuTriggerRef={phoneMenuTriggerRef}
      />

      {message ? (
        <Alert
          tone="danger"
          action={
            message.retry ? (
              <Button type="button" variant="outline" size="sm" disabled={fetching} onClick={refresh}>
                Try again
              </Button>
            ) : undefined
          }
        >
          {message.text}
        </Alert>
      ) : null}

      {content}

      {isExecutiveRole ? (
        <AssociatesDialog
          cycles={cycles}
          activeCycleNumber={activeCycleNumber}
          open={associatesOpen}
          onOpenChange={setAssociatesOpen}
          returnFocusRef={associatesOpenerRef}
        />
      ) : null}
    </div>
  );
}
