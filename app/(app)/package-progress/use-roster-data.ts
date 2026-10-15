"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_ROW,
  mergeRosterUsers,
  normalizeProgressRow,
  serializeRows,
  stageSnapshot,
  withoutClientKey,
  type AssignableProducer,
  type CycleTab,
  type PackageProgressPayload,
  type PayloadRow,
  type ProgressRow,
  type RosterUser
} from "./roster-model";

type QueuedSave = {
  cycleNumber: number;
  rows: ProgressRow[];
};

/** The one error line under the toolbar. `retrySave` adds "Try again" for a failed autosave. */
export type RosterNotice = { title?: string; text: string; retrySave?: boolean };

/** A row picked from the menu: by id when it has one, else by its index in the full list. */
export type RowTarget = { rowId: string | null; rowIndex: number };

async function fetchCycle(cycleNumber?: number) {
  const query = typeof cycleNumber === "number" ? `?cycle=${cycleNumber}` : "";
  const response = await fetch(`/api/package-progress${query}`, { cache: "no-store" });
  const payload = (await response.json()) as { data?: PackageProgressPayload; error?: { message?: string } };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load package cycle.");
  }

  return {
    ...payload.data,
    rows: payload.data.rows.map(normalizeProgressRow)
  };
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Roster state for /package-progress: the cycle load, the autosave queue (one request at a time,
 * the latest full-roster snapshot wins), refresh, move and delete. Saved `rows` and the editing
 * copy `draftRows` are kept apart so view mode always shows what the server has.
 */
export function useRosterData(initialData?: PackageProgressPayload) {
  const initialRows = useMemo(() => (initialData?.rows ?? []).map(normalizeProgressRow), [initialData]);
  const [cycles, setCycles] = useState<CycleTab[]>(initialData?.cycles ?? []);
  const [activeCycleNumber, setActiveCycleNumber] = useState(initialData?.activeCycleNumber ?? 1);
  const [rows, setRows] = useState<ProgressRow[]>(initialRows);
  const [draftRows, setDraftRows] = useState<ProgressRow[]>(initialRows);
  const [stageById, setStageById] = useState<Map<string, PayloadRow>>(() => stageSnapshot(initialRows));
  const [keyById, setKeyById] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [fetchedUsers, setFetchedUsers] = useState<RosterUser[]>([]);
  const [producers, setProducers] = useState<AssignableProducer[]>(initialData?.producers ?? []);
  const [executives, setExecutives] = useState<AssignableProducer[]>(initialData?.executives ?? []);
  const [previousTeammatesByUser, setPreviousTeammatesByUser] = useState<Record<string, string[]>>(
    initialData?.previousTeammatesByUser ?? {}
  );
  const [canEdit, setCanEdit] = useState(initialData?.canEdit ?? false);
  const [canAssignProducer, setCanAssignProducer] = useState(initialData?.canAssignProducer ?? false);
  // Editors open the page already editing.
  const [editing, setEditing] = useState(Boolean(initialData?.canEdit));
  const [loading, setLoading] = useState(!initialData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailedState] = useState(false);
  /** A save has landed for this cycle since the page opened (so "Saved" is true, not assumed). */
  const [savedOnce, setSavedOnce] = useState(false);
  const [notice, setNotice] = useState<RosterNotice | null>(null);
  /** Bumped on every load and refresh, so filters can re-pin their rows. */
  const [dataVersion, setDataVersion] = useState(0);

  const initializedEditModeRef = useRef(Boolean(initialData));
  const hasResolvedInitialCycleRef = useRef(Boolean(initialData));
  const hasUsedInitialDataRef = useRef(Boolean(initialData));
  const activeCycleNumberRef = useRef(activeCycleNumber);
  /** The cycle the rows on screen were loaded from. Saves are refused for any other cycle. */
  const loadedCycleRef = useRef<number | null>(initialData ? initialData.activeCycleNumber : null);
  /** True while a cycle loads or after its load failed: nothing may be edited or saved. */
  const lockedRef = useRef(!initialData);
  const editingRef = useRef(editing);
  const rowsRef = useRef<ProgressRow[]>(initialRows);
  const draftRowsRef = useRef<ProgressRow[]>(initialRows);
  const saveInFlightRef = useRef(false);
  /** The last save failed: the editing copy holds edits the server doesn't have yet. */
  const saveFailedRef = useRef(false);
  const queuedSaveRef = useRef<QueuedSave | null>(null);
  const clientKeyCounterRef = useRef(0);

  useEffect(() => {
    activeCycleNumberRef.current = activeCycleNumber;
  }, [activeCycleNumber]);

  useEffect(() => {
    lockedRef.current = loading || loadError !== null;
  }, [loading, loadError]);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    draftRowsRef.current = draftRows;
  }, [draftRows]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/platform/users", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { data?: RosterUser[] };
        if (active && Array.isArray(payload.data)) {
          setFetchedUsers(payload.data);
        }
      } catch {
        // ignore — autocomplete is optional (names also come from the roster payload)
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function setSavedRows(nextRows: ProgressRow[]) {
    rowsRef.current = nextRows;
    setRows(nextRows);
  }

  function setLocalDraftRows(nextRows: ProgressRow[]) {
    setDraftRows(nextRows);
    draftRowsRef.current = nextRows;
  }

  function replaceLocalRows(nextRows: ProgressRow[]) {
    setSavedRows(nextRows);
    setLocalDraftRows(nextRows);
  }

  function setSaveFailed(next: boolean) {
    saveFailedRef.current = next;
    setSaveFailedState(next);
  }

  function setEditingMode(next: boolean) {
    editingRef.current = next;
    setEditing(next);
  }

  function applyPayload(data: Awaited<ReturnType<typeof fetchCycle>>) {
    setCycles(data.cycles);
    setCanEdit(data.canEdit);
    setCanAssignProducer(Boolean(data.canAssignProducer));
    setProducers(data.producers ?? []);
    setExecutives(data.executives ?? []);
    setPreviousTeammatesByUser(data.previousTeammatesByUser ?? {});
    setStageById(stageSnapshot(data.rows));
    loadedCycleRef.current = data.activeCycleNumber;
    // Fresh rows from the server replace any unsaved edits, so nothing is left to retry.
    setSaveFailed(false);
    replaceLocalRows(data.rows);
    setDataVersion((version) => version + 1);
    if (!initializedEditModeRef.current) {
      setEditingMode(data.canEdit);
      initializedEditModeRef.current = true;
    }
  }

  useEffect(() => {
    if (hasUsedInitialDataRef.current && initialData) {
      hasUsedInitialDataRef.current = false;
      setLoading(false);
      return;
    }

    let active = true;

    async function hydrate() {
      try {
        setLoading(true);
        setNotice(null);
        setLoadError(null);
        const data = await fetchCycle(hasResolvedInitialCycleRef.current ? activeCycleNumber : undefined);
        hasResolvedInitialCycleRef.current = true;
        if (!active) return;
        applyPayload(data);
        setActiveCycleNumber(data.activeCycleNumber);
      } catch (error) {
        if (!active) return;
        setLoadError(errorText(error, "Failed to load package cycle."));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      active = false;
    };
    // applyPayload only calls state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCycleNumber, initialData, reloadToken]);

  // Saved rows only change on load/save, so serialize them once instead of on every keystroke.
  const serializedRows = useMemo(() => serializeRows(rows), [rows]);
  const isDirty = useMemo(() => serializedRows !== serializeRows(draftRows), [serializedRows, draftRows]);
  const users = useMemo(() => mergeRosterUsers(fetchedUsers, rows), [fetchedUsers, rows]);

  /** A new row's client key carries over to its id once the save returns, so the row never remounts. */
  function rememberRowKeys(posted: ProgressRow[], saved: ProgressRow[]) {
    const additions = posted.flatMap((row, index) => {
      const savedId = saved[index]?.id;
      return row.clientKey && !row.id && savedId ? [[savedId, row.clientKey] as const] : [];
    });
    if (additions.length > 0) {
      setKeyById((current) => new Map([...current, ...additions]));
    }
  }

  async function flushQueuedSaves() {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);

    while (queuedSaveRef.current) {
      const saveJob = queuedSaveRef.current;
      queuedSaveRef.current = null;

      if (saveJob.cycleNumber !== activeCycleNumberRef.current) {
        continue;
      }

      try {
        setNotice(null);
        const response = await fetch("/api/package-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cycleNumber: saveJob.cycleNumber,
            rows: saveJob.rows.map(withoutClientKey)
          })
        });
        const payload = (await response.json()) as {
          data?: { cycleNumber: number; rows: ProgressRow[] };
          error?: { message?: string };
        };

        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "Failed to save progress.");
        }

        const savedRows = payload.data.rows.map(normalizeProgressRow);

        if (activeCycleNumberRef.current === saveJob.cycleNumber) {
          setSaveFailed(false);
          setSavedOnce(true);
          rememberRowKeys(saveJob.rows, savedRows);
          setSavedRows(savedRows);
          // Replace drafts only if they still match what was posted, so a new row picks up its id
          // and later saves update it instead of creating a duplicate.
          setDraftRows((current) => (serializeRows(current) === serializeRows(saveJob.rows) ? savedRows : current));
        }
      } catch (error) {
        if (activeCycleNumberRef.current === saveJob.cycleNumber) {
          setSaveFailed(true);
          setNotice({ title: "Changes didn't save", text: errorText(error, "Failed to save progress."), retrySave: true });
        } else {
          // The person already switched cycles ("Switch anyway"); retrying here would post this
          // cycle's rows, so only say what was lost.
          toast.error(`Changes to Cycle ${saveJob.cycleNumber} didn't save.`);
        }
      }
    }

    saveInFlightRef.current = false;

    if (queuedSaveRef.current) {
      void flushQueuedSaves();
      return;
    }

    setSaving(false);
  }

  function queueAutosave(nextRows: ProgressRow[]) {
    // Never post rows under a cycle they were not loaded from: the POST deletes every row of that
    // cycle that is missing from the list.
    if (lockedRef.current || loadedCycleRef.current !== activeCycleNumberRef.current) return;
    queuedSaveRef.current = {
      cycleNumber: activeCycleNumberRef.current,
      rows: nextRows
    };
    void flushQueuedSaves();
  }

  function updateDraftRow(index: number, next: Partial<ProgressRow>, options?: { autosave?: boolean }) {
    if (lockedRef.current) return;
    const nextRows = draftRowsRef.current.map((row, rowIndex) =>
      rowIndex === index
        ? {
            ...row,
            ...next
          }
        : row
    );

    setLocalDraftRows(nextRows);

    if (options?.autosave) {
      queueAutosave(nextRows);
    }
  }

  /** Appends an empty group and saves; returns its client key (null while a cycle is loading). */
  function addDraftRow(): string | null {
    if (lockedRef.current) return null;
    clientKeyCounterRef.current += 1;
    const clientKey = `new-${clientKeyCounterRef.current}`;
    const nextRows = [...draftRowsRef.current, { ...DEFAULT_ROW, clientKey }];
    setLocalDraftRows(nextRows);
    queueAutosave(nextRows);
    return clientKey;
  }

  /** Removes the row from the roster and saves; the server deletes rows missing from the list. */
  function deleteRow(target: RowTarget) {
    if (lockedRef.current) return;
    const currentRows = draftRowsRef.current;
    const rowIndexById =
      target.rowId === null ? -1 : currentRows.findIndex((candidate) => candidate.id === target.rowId);
    const targetIndex = rowIndexById >= 0 ? rowIndexById : target.rowIndex;

    if (targetIndex < 0 || targetIndex >= currentRows.length) {
      return;
    }

    const nextRows = currentRows.filter((_, index) => index !== targetIndex);
    setLocalDraftRows(nextRows);

    if (!editingRef.current) {
      setSavedRows(nextRows);
    }

    queueAutosave(nextRows);
  }

  async function waitForPendingSaves() {
    const deadline = Date.now() + 5000;
    while ((queuedSaveRef.current || saveInFlightRef.current) && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 60));
    }
  }

  async function moveRow(target: RowTarget, toCycleNumber: number) {
    if (lockedRef.current) return;
    // A just-added row gets its id from the autosave, so let saves land first.
    await waitForPendingSaves();
    const rowId = target.rowId ?? draftRowsRef.current[target.rowIndex]?.id ?? null;
    if (!rowId) {
      setNotice({ text: "This group is still saving. Try again in a moment." });
      return;
    }

    try {
      setNotice(null);
      const response = await fetch(`/api/package-progress/${rowId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleNumber: toCycleNumber })
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to move package.");
      }
      setSavedRows(rowsRef.current.filter((row) => row.id !== rowId));
      setLocalDraftRows(draftRowsRef.current.filter((row) => row.id !== rowId));
      toast.success(`Moved to Cycle ${toCycleNumber}.`);
    } catch (error) {
      setNotice({ title: "Couldn't move this group", text: errorText(error, "Failed to move package.") });
    }
  }

  /**
   * Reloads the cycle once pending saves land. The fresh rows replace the editing copy, so after a
   * failed save (before Refresh, or while it waited) it stops and keeps those edits for Try again,
   * unless the person chose to drop them.
   */
  async function refresh(options?: { discardUnsaved?: boolean }) {
    const cycleNumber = activeCycleNumberRef.current;
    try {
      setRefreshing(true);
      await waitForPendingSaves();
      if (saveFailedRef.current && !options?.discardUnsaved) return;
      setNotice(null);
      const data = await fetchCycle(cycleNumber);
      // The person switched cycles while this was loading; that load owns the screen now.
      if (activeCycleNumberRef.current !== cycleNumber) return;
      applyPayload(data);
      setLoadError(null);
    } catch (error) {
      setNotice({ title: "Couldn't refresh", text: errorText(error, "Failed to refresh package cycle.") });
    } finally {
      setRefreshing(false);
    }
  }

  /** Switches to another cycle (the caller already confirmed unsaved changes). */
  function switchCycle(cycleNumber: number) {
    queuedSaveRef.current = null;
    lockedRef.current = true;
    activeCycleNumberRef.current = cycleNumber;
    setSaveFailed(false);
    setSavedOnce(false);
    setLoading(true);
    setActiveCycleNumber(cycleNumber);
  }

  /**
   * Edit mode starts from the latest saved rows, unless a save is still landing (which replaces
   * them) or the last save failed (its edits stay, so they show and Try again can send them).
   */
  function enterEdit() {
    if (lockedRef.current) return;
    if (!queuedSaveRef.current && !saveInFlightRef.current && !saveFailedRef.current) {
      setLocalDraftRows(rowsRef.current);
    }
    setEditingMode(true);
  }

  /**
   * View mode: edits are already saved, so this only resyncs the editing copy once saves land.
   * A failed save keeps its edits in the editing copy for Try again.
   */
  async function enterView() {
    setEditingMode(false);
    await waitForPendingSaves();
    if (!editingRef.current && !saveFailedRef.current) {
      setLocalDraftRows(rowsRef.current);
    }
  }

  function rowKey(row: ProgressRow, index: number) {
    if (row.id) return keyById.get(row.id) ?? row.id;
    return row.clientKey ?? `${activeCycleNumber}-${index}`;
  }

  return {
    cycles,
    activeCycleNumber,
    rows,
    draftRows,
    stageById,
    users,
    producers,
    executives,
    previousTeammatesByUser,
    canEdit,
    canAssignProducer,
    editing,
    loading,
    loadError,
    locked: loading || loadError !== null,
    refreshing,
    saving,
    saveFailed,
    savedOnce,
    isDirty,
    notice,
    dataVersion,
    rowKey,
    dismissNotice: () => setNotice(null),
    retrySave: () => queueAutosave(draftRowsRef.current),
    reload: () => setReloadToken((token) => token + 1),
    updateDraftRow,
    addDraftRow,
    deleteRow,
    moveRow,
    refresh,
    switchCycle,
    enterEdit,
    enterView
  };
}
