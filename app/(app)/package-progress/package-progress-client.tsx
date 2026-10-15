"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { useHotkeys } from "@/components/kit/hotkeys";
import type { MenuEntry } from "@/components/kit/menu";
import { Panel } from "@/components/kit/panel";
import { useRememberedState } from "@/components/kit/remembered-state";
import type { SaveStateValue } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { mergeAssignableProducerOptions } from "@/src/lib/package-producer-assignment";
import type { RosterCellContext } from "./roster-cells";
import { RosterHeader } from "./roster-header";
import { RosterList, type RosterEntry } from "./roster-list";
import {
  currentCycleNumber,
  cycleSpanLabel,
  cycleStatus,
  filterCounts,
  hasMembers,
  hasProducer,
  isRosterFilter,
  matchesFilter,
  ROSTER_FILTER_LABELS,
  rowStatus,
  type FilterContext,
  type PackageProgressPayload,
  type RosterFilter
} from "./roster-model";
import { DeleteGroupConfirm, rowMenuEntries, useRowMenus, type DeleteTarget, type RowMenuTarget } from "./roster-row-menu";
import { CycleSwitchConfirm, RefreshConfirm, RosterFilters, RosterToolbar, type RosterMode } from "./roster-toolbar";
import { useRosterData } from "./use-roster-data";

export type { PackageProgressPayload } from "./roster-model";

const FILTER_STORAGE_KEY = "package-progress:filter:v1";

/**
 * Rows a chosen filter showed stay on screen until the filter, the cycle or the data (load,
 * Refresh) changes, so fixing a gap (assigning a producer under "No producer") never makes the
 * row jump away mid-edit. Counts still update live.
 */
type PinnedFilter = { filter: RosterFilter; version: string; keys: ReadonlySet<string> };

function menuTarget(entry: RosterEntry): RowMenuTarget {
  return {
    rowKey: entry.key,
    rowId: entry.row.id ?? null,
    rowIndex: entry.index,
    topic: entry.row.groupTopic,
    groupHref: entry.status.href
  };
}

function subscribeNever() {
  return () => undefined;
}

export default function PackageProgressClient({
  initialData,
  viewerUserId,
  renderedAt
}: {
  initialData?: PackageProgressPayload;
  /** The signed-in person, for the "Assigned to me" filter. */
  viewerUserId?: string;
  /** The server's clock when it rendered, so the first client render matches it (hydration). */
  renderedAt?: number;
}) {
  const roster = useRosterData(initialData);
  const { cycles, activeCycleNumber, canEdit, locked } = roster;
  const isEditing = roster.editing && canEdit;
  const [deleteDialog, setDeleteDialog] = useState<{ target: DeleteTarget; open: boolean } | null>(null);
  const [cycleDialog, setCycleDialog] = useState<{ cycleNumber: number; open: boolean } | null>(null);
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false);
  /** The new row whose topic field takes focus once it is on screen (read after commit only). */
  const focusKeyRef = useRef<string | null>(null);
  const [storedFilter, setStoredFilter, filterLoaded] = useRememberedState<RosterFilter>(
    FILTER_STORAGE_KEY,
    "all",
    isRosterFilter
  );
  // A filter for this visit only (not remembered): All when the remembered one matches nothing,
  // or after Add group. Picking a chip clears it.
  const [sessionFilter, setSessionFilter] = useState<RosterFilter | null>(null);
  const filter = sessionFilter ?? storedFilter;
  const [pinned, setPinned] = useState<PinnedFilter | null>(null);

  // One clock per load, so time-based statuses ("Pending Review for 3h") hold still between refreshes.
  // The first render uses the server's time, then this device's once hydrated.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [clock, setClock] = useState(() => ({
    version: roster.dataVersion,
    now: new Date(renderedAt ?? Date.now()),
    local: false
  }));
  if (clock.version !== roster.dataVersion) {
    setClock({ version: roster.dataVersion, now: new Date(), local: true });
  } else if (hydrated && !clock.local) {
    setClock({ ...clock, now: new Date(), local: true });
  }
  const now = clock.now;

  const activeCycle = cycles.find((cycle) => cycle.cycleNumber === activeCycleNumber) ?? null;
  const currentCycle = useMemo(() => currentCycleNumber(cycles, now), [cycles, now]);
  const activeStatus = activeCycle ? cycleStatus(activeCycle, currentCycle, now) : null;
  const span = activeCycle ? cycleSpanLabel(activeCycle) : null;

  const usersById = useMemo(() => new Map(roster.users.map((user) => [user.id, user])), [roster.users]);
  const producerOptions = useMemo(
    () => mergeAssignableProducerOptions(roster.producers, roster.executives),
    [roster.producers, roster.executives]
  );
  const executiveIds = useMemo(() => new Set(roster.executives.map((user) => user.userId)), [roster.executives]);

  const list = isEditing ? roster.draftRows : roster.rows;
  const entries: RosterEntry[] = list.map((row, index) => ({
    row,
    index,
    key: roster.rowKey(row, index),
    // Stage fields come from the last load (saves don't return them); new rows use their own flags.
    status: rowStatus((row.id && roster.stageById.get(row.id)) || row, activeCycle?.dates, now)
  }));
  const filterContext: FilterContext = {
    previousTeammatesByUser: roster.previousTeammatesByUser,
    viewerUserId: viewerUserId ?? null
  };
  const counts = filterCounts(list, filterContext);

  // Pin the rows a filter matches (derived during render; see PinnedFilter).
  const pinVersion = `${activeCycleNumber}:${roster.dataVersion}`;
  if (filterLoaded && !locked && filter !== "all" && (pinned?.filter !== filter || pinned.version !== pinVersion)) {
    const keys = entries.filter((entry) => matchesFilter(filter, entry.row, filterContext)).map((entry) => entry.key);
    if (keys.length === 0) {
      setSessionFilter("all");
    } else {
      setPinned({ filter, version: pinVersion, keys: new Set(keys) });
    }
  }
  const visibleEntries =
    filter === "all"
      ? entries
      : pinned?.filter === filter
        ? entries.filter((entry) => pinned.keys.has(entry.key))
        : entries.filter((entry) => matchesFilter(filter, entry.row, filterContext));

  const emptyRoster = !locked && list.length === 0;

  // After each commit until the new row's field is on screen.
  useEffect(() => {
    const focusKey = focusKeyRef.current;
    if (!focusKey) return;
    const field = document.querySelector<HTMLElement>(`[data-row-key="${focusKey}"] [data-topic-field]`);
    if (!field) return;
    focusKeyRef.current = null;
    field.scrollIntoView({ block: "center", behavior: "smooth" });
    field.focus({ preventScroll: true });
  });

  function changeFilter(next: RosterFilter) {
    setPinned(null);
    setSessionFilter(null);
    setStoredFilter(next);
  }

  function switchTo(cycleNumber: number) {
    menus.close();
    setPinned(null);
    roster.switchCycle(cycleNumber);
  }

  function requestCycle(cycleNumber: number) {
    if (cycleNumber === activeCycleNumber) return;
    // In either mode: View keeps a failed save's edits for Try again, and a save can still be
    // landing after switching to View, so switching cycles would drop them without asking.
    if (roster.isDirty || roster.saving || roster.saveFailed) {
      setCycleDialog({ cycleNumber, open: true });
      return;
    }
    switchTo(cycleNumber);
  }

  function stepCycle(delta: -1 | 1) {
    const numbers = cycles.map((cycle) => cycle.cycleNumber).sort((a, b) => a - b);
    const next = numbers[numbers.indexOf(activeCycleNumber) + delta];
    if (next !== undefined) requestCycle(next);
  }

  useHotkeys({ "[": () => stepCycle(-1), "]": () => stepCycle(1) }, { enabled: cycles.length > 1 });

  function changeMode(mode: RosterMode) {
    menus.close();
    if (mode === "edit") roster.enterEdit();
    else void roster.enterView();
  }

  function addGroup() {
    if (locked) return;
    menus.close();
    if (!isEditing) roster.enterEdit();
    // Show every row so the new one is on screen (this visit only; the remembered filter stays).
    if (filter !== "all") {
      setPinned(null);
      setSessionFilter("all");
    }
    const key = roster.addDraftRow();
    if (key) focusKeyRef.current = key;
  }

  const moveTargets = cycles.filter((cycle) => cycle.cycleNumber !== activeCycleNumber).map((cycle) => cycle.cycleNumber);

  // The menu closes itself when an item is chosen.
  function menuItemsFor(target: RowMenuTarget): MenuEntry[] {
    return rowMenuEntries({
      target,
      moveTargets,
      onMove: (cycleNumber) => void roster.moveRow({ rowId: target.rowId, rowIndex: target.rowIndex }, cycleNumber),
      onDelete: () =>
        setDeleteDialog({ target: { rowId: target.rowId, rowIndex: target.rowIndex, topic: target.topic }, open: true })
    });
  }

  const menus = useRowMenus({ enabled: canEdit && !locked, itemsFor: menuItemsFor });

  // "Saved" only once a save has landed this visit; nothing is claimed before then.
  const saveState: SaveStateValue = roster.saveFailed
    ? "error"
    : roster.saving
      ? "saving"
      : isEditing && roster.savedOnce
        ? "saved"
        : "idle";

  const cellContext: RosterCellContext = {
    canEdit,
    editing: isEditing,
    canAssignProducer: roster.canAssignProducer,
    locked,
    users: roster.users,
    usersById,
    producers: roster.producers,
    executives: roster.executives,
    producerOptions,
    executiveIds,
    previousTeammatesByUser: roster.previousTeammatesByUser
  };

  const addGroupButton = (
    <Button type="button" onClick={addGroup} disabled={locked}>
      <Plus aria-hidden />
      Add group
    </Button>
  );

  return (
    <div className="route-enter space-y-5">
      <RosterHeader
        cycle={activeCycle}
        status={activeStatus}
        span={span}
        canEdit={canEdit}
        editing={isEditing}
        saveState={saveState}
        addGroup={canEdit && !emptyRoster ? addGroupButton : null}
      />

      <RosterToolbar
        filters={
          roster.loading || (!roster.loadError && list.length > 0) ? (
            <RosterFilters
              loading={roster.loading}
              value={filter}
              counts={counts}
              withMembers={list.filter(hasMembers).length}
              withProducer={list.filter(hasProducer).length}
              showMine={Boolean(viewerUserId)}
              onChange={changeFilter}
            />
          ) : null
        }
        cycles={cycles}
        activeCycleNumber={activeCycleNumber}
        currentCycleNumber={currentCycle}
        canEdit={canEdit}
        mode={isEditing ? "edit" : "view"}
        modeDisabled={locked}
        // Refresh also recovers from a cycle that failed to load.
        refreshDisabled={roster.loading}
        refreshing={roster.refreshing}
        onCycleChange={requestCycle}
        onModeChange={changeMode}
        onRefresh={() => {
          menus.close();
          // Refresh replaces edits that didn't save, so it asks first (like switching cycles).
          if (roster.saveFailed) setRefreshDialogOpen(true);
          else void roster.refresh();
        }}
      />

      {roster.notice ? (
        <Alert
          tone="danger"
          title={roster.notice.title}
          onDismiss={roster.dismissNotice}
          action={
            roster.notice.retrySave ? (
              <Button type="button" variant="outline" size="sm" onClick={roster.retrySave}>
                Try again
              </Button>
            ) : undefined
          }
        >
          {roster.notice.text}
        </Alert>
      ) : null}

      <Panel padding="none" aria-label={`Cycle ${activeCycleNumber} roster`} className="overflow-hidden">
        <RosterList
          entries={visibleEntries}
          totalCount={list.length}
          context={cellContext}
          loading={roster.loading}
          loadError={roster.loadError}
          cycleNumber={activeCycleNumber}
          filterLabel={filter === "all" ? null : ROSTER_FILTER_LABELS[filter]}
          menuRowKey={menus.rowKey}
          buttonMenuKey={menus.buttonKey}
          menuItemsFor={(entry) => menuItemsFor(menuTarget(entry))}
          emptyAction={canEdit ? addGroupButton : undefined}
          onRetry={roster.reload}
          onShowAll={() => changeFilter("all")}
          onUpdateRow={(index, next) => roster.updateDraftRow(index, next, { autosave: true })}
          onRowClick={() => {
            if (!isEditing && canEdit && !locked) roster.enterEdit();
          }}
          onRowContextMenu={(entry, event) => {
            if (!canEdit || locked) return;
            event.preventDefault();
            menus.openAt(menuTarget(entry), event.clientX, event.clientY);
          }}
          // The ⋯ button: the same menu as right-click, for touch screens (iOS has no contextmenu).
          onMenuOpenChange={(entry, open) => menus.onButtonOpenChange(menuTarget(entry), open)}
        />
      </Panel>

      {menus.pointMenu}

      <DeleteGroupConfirm
        target={deleteDialog?.target ?? null}
        open={Boolean(deleteDialog?.open)}
        cycleNumber={activeCycleNumber}
        onOpenChange={(open) => setDeleteDialog((current) => (current ? { ...current, open } : current))}
        onConfirm={() => {
          if (deleteDialog) roster.deleteRow(deleteDialog.target);
        }}
      />

      <RefreshConfirm
        open={refreshDialogOpen}
        onOpenChange={setRefreshDialogOpen}
        onConfirm={() => void roster.refresh({ discardUnsaved: true })}
      />

      <CycleSwitchConfirm
        cycleNumber={cycleDialog?.cycleNumber ?? null}
        open={Boolean(cycleDialog?.open)}
        saveFailed={roster.saveFailed}
        onOpenChange={(open) => setCycleDialog((current) => (current ? { ...current, open } : current))}
        onConfirm={() => {
          if (cycleDialog) switchTo(cycleDialog.cycleNumber);
        }}
      />
    </div>
  );
}
