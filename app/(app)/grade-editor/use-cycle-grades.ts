"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CheckInStage } from "@/src/lib/package-stages";
import { fetchGrades } from "./grade-editor-api";
import type { CycleAverage, CycleTab, GradeMutationPayload, GradeRow } from "./grade-editor-types";
import { applyMutationToRow, isRowFilledIn, rowHasUnsavedChanges } from "./grade-editor-utils";

/**
 * One cycle's grade rows and the autosave engine (moved verbatim from the old client):
 * 700 ms debounce per row, one serialized save queue, blocked while Save all / Publish all /
 * a row publish runs and resumed afterwards, a sequence guard on cycle loads, and check-in
 * overrides saved one at a time. Rows still waiting to autosave are saved when the page unmounts.
 * A save or publish response for a cycle that is no longer loaded never touches the rows on screen,
 * and Save all / Publish all stop if another cycle loads (the page also blocks that while they run).
 */
export function useCycleGrades({
  setMessage,
  onCycles,
  onCheckInSaved,
  onRowChanged
}: {
  setMessage: (message: string | null) => void;
  onCycles: (cycles: CycleTab[]) => void;
  /** A check-in override saved: that user's Total check-in seed is stale. */
  onCheckInSaved: (userId: string) => void;
  /** A save or publish landed for one row (the row as it is now). */
  onRowChanged: (row: GradeRow, cycleNumber: number) => void;
}) {
  const [activeCycleNumber, setActiveCycleNumber] = useState(1);
  const [rows, setRows] = useState<GradeRow[]>([]);
  const [savedRows, setSavedRows] = useState<GradeRow[]>([]);
  const [cycleAverages, setCycleAverages] = useState<CycleAverage[]>([]);
  const [loading, setLoading] = useState(false);
  /** The cycle a load is fetching right now (the clicked tab lights up at once). */
  const [pendingCycleNumber, setPendingCycleNumber] = useState<number | null>(null);
  /** Bumps when fresh rows land (filter snapshots are re-taken). */
  const [loadVersion, setLoadVersion] = useState(0);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [failedUserId, setFailedUserId] = useState<string | null>(null);
  const [publishingUserId, setPublishingUserId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [publishingAll, setPublishingAll] = useState(false);
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  const [extensionDepletedWarning, setExtensionDepletedWarning] = useState<{ userName: string; remaining: number } | null>(null);
  const autosaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingAutosaveUserIdsRef = useRef<Set<string>>(new Set());
  const autosaveRunningRef = useRef(false);
  const rowsRef = useRef<GradeRow[]>([]);
  const savedRowMapRef = useRef<Map<string, GradeRow>>(new Map());
  const activeCycleNumberRef = useRef(1);
  const autosaveBlockedRef = useRef({ savingAll: false, publishingAll: false, publishingUserId: null as string | null });
  const flushAutosavesRef = useRef<() => Promise<void>>(async () => {});
  const loadCycleSequenceRef = useRef(0);
  const checkInSaveRef = useRef(false);
  /** The cycle last asked for, so Refresh retries it even when its first load failed. */
  const requestedCycleRef = useRef(1);

  const savedRowMap = useMemo(() => {
    return new Map(savedRows.map((row) => [row.userId, row]));
  }, [savedRows]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    savedRowMapRef.current = savedRowMap;
  }, [savedRowMap]);

  useEffect(() => {
    activeCycleNumberRef.current = activeCycleNumber;
  }, [activeCycleNumber]);

  useEffect(() => {
    autosaveBlockedRef.current = { savingAll, publishingAll, publishingUserId };
  }, [savingAll, publishingAll, publishingUserId]);

  const dirtyUserIds = useMemo(
    () => new Set(rows.filter((row) => rowHasUnsavedChanges(row, savedRowMap.get(row.userId))).map((row) => row.userId)),
    [rows, savedRowMap]
  );
  const hasUnsavedChanges = dirtyUserIds.size > 0;
  const busy = savingAll || publishingAll || savingUserId !== null || publishingUserId !== null;

  async function loadCycle(cycleNumber: number, options?: { silent?: boolean }) {
    const sequence = ++loadCycleSequenceRef.current;
    requestedCycleRef.current = cycleNumber;
    setPendingCycleNumber(cycleNumber);
    try {
      clearAllAutosaves();
      if (!options?.silent) {
        setLoading(true);
      }
      setMessage(null);
      const data = await fetchGrades(cycleNumber);
      if (loadCycleSequenceRef.current !== sequence) return;
      // Set at once (not only after the render): a save or publish for the old cycle that lands
      // in between must see that its rows are gone (see sameCycle in saveRow and togglePublish).
      rowsRef.current = data.rows;
      activeCycleNumberRef.current = data.activeCycleNumber;
      onCycles(data.cycles);
      setActiveCycleNumber(data.activeCycleNumber);
      setRows(data.rows);
      setSavedRows(data.rows);
      setCycleAverages(data.cycleAverages);
      setFailedUserId(null);
      setLoadVersion((value) => value + 1);
    } catch (error) {
      if (loadCycleSequenceRef.current !== sequence) return;
      setMessage(error instanceof Error ? error.message : "Failed to load grades.");
    } finally {
      if (loadCycleSequenceRef.current === sequence) {
        setPendingCycleNumber(null);
        if (!options?.silent) {
          setLoading(false);
        }
      }
    }
  }

  flushAutosavesRef.current = flushAutosaves;

  function autosaveBlocked() {
    return (
      autosaveBlockedRef.current.savingAll ||
      autosaveBlockedRef.current.publishingAll ||
      autosaveBlockedRef.current.publishingUserId !== null
    );
  }

  function clearAllAutosaves() {
    for (const timer of autosaveTimersRef.current.values()) {
      clearTimeout(timer);
    }
    autosaveTimersRef.current.clear();
    pendingAutosaveUserIdsRef.current.clear();
  }

  function clearRowAutosaveTimer(userId: string) {
    const existing = autosaveTimersRef.current.get(userId);
    if (!existing) return;
    clearTimeout(existing);
    autosaveTimersRef.current.delete(userId);
  }

  async function flushAutosaves() {
    if (autosaveRunningRef.current) return;
    if (autosaveBlocked()) return;

    autosaveRunningRef.current = true;

    try {
      while (pendingAutosaveUserIdsRef.current.size > 0) {
        if (autosaveBlocked()) {
          return;
        }

        const nextUserId = pendingAutosaveUserIdsRef.current.values().next().value as string | undefined;
        if (!nextUserId) {
          return;
        }

        pendingAutosaveUserIdsRef.current.delete(nextUserId);

        const latestRow = rowsRef.current.find((entry) => entry.userId === nextUserId);
        const latestBaseline = savedRowMapRef.current.get(nextUserId);
        if (!latestRow || !rowHasUnsavedChanges(latestRow, latestBaseline)) {
          continue;
        }

        await saveRow(nextUserId);
      }
    } finally {
      autosaveRunningRef.current = false;

      if (pendingAutosaveUserIdsRef.current.size > 0 && !autosaveBlocked()) {
        void flushAutosaves();
      }
    }
  }

  function scheduleRowAutosave(userId: string) {
    clearRowAutosaveTimer(userId);

    const timer = setTimeout(() => {
      autosaveTimersRef.current.delete(userId);
      pendingAutosaveUserIdsRef.current.add(userId);
      void flushAutosaves();
    }, 700);

    autosaveTimersRef.current.set(userId, timer);
  }

  function updateRow(userId: string, patch: Partial<GradeRow>) {
    setRows((current) =>
      current.map((row) =>
        row.userId === userId
          ? {
              ...row,
              ...patch
            }
          : row
      )
    );
  }

  function updateRowAndAutosave(userId: string, patch: Partial<GradeRow>) {
    updateRow(userId, patch);
    scheduleRowAutosave(userId);
  }

  async function saveCheckIn(userId: string, stage: CheckInStage, value: string) {
    if (checkInSaveRef.current) return;
    const cycleNumber = activeCycleNumberRef.current;
    checkInSaveRef.current = true;
    setSavingCheckIn(true);
    try {
      const response = await fetch("/api/grades/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setCheckIn",
          userId,
          cycleNumber,
          stage,
          points: value === "auto" ? null : value === "UNGRADED" || value === "EXEMPT" ? value : Number(value)
        })
      });
      const payload = (await response.json()) as {
        data?: Pick<GradeRow, "checkInScores" | "checkInOverrides">;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Failed to save check-in.");
      if (activeCycleNumberRef.current === cycleNumber) {
        const patch = payload.data;
        setRows((current) => current.map((row) => (row.userId === userId ? { ...row, ...patch } : row)));
        setSavedRows((current) => current.map((row) => (row.userId === userId ? { ...row, ...patch } : row)));
      }
      onCheckInSaved(userId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save check-in.");
    } finally {
      checkInSaveRef.current = false;
      setSavingCheckIn(false);
    }
  }

  async function saveRow(userId: string) {
    const row = rowsRef.current.find((entry) => entry.userId === userId);
    if (!row) return false;
    const cycleNumber = activeCycleNumberRef.current;
    const previousSaved = savedRowMapRef.current.get(userId);

    try {
      setSavingUserId(userId);

      const response = await fetch("/api/grades/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          cycleNumber,
          userId,
          effortPoints: row.effortPoints,
          finalCutState: row.finalCutState,
          teamworkPoints: row.teamworkPoints ?? 0,
          feedback: row.feedback,
          turnedInDate: row.turnedInDate
        })
      });

      const payload = (await response.json()) as {
        data?: GradeMutationPayload;
        error?: { message?: string };
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to save grade.");
      }
      const data = payload.data;
      // Another cycle's rows may have loaded meanwhile: the save still counts (for its own
      // cycle), but the rows on screen are a different cycle's and must not take its values.
      const sameCycle = activeCycleNumberRef.current === cycleNumber;

      if (sameCycle) {
        clearRowAutosaveTimer(userId);
        pendingAutosaveUserIdsRef.current.delete(userId);
      }

      const turnedInDateChanged = (previousSaved?.turnedInDate ?? null) !== (data.turnedInDate ?? null);
      const rowEntry = sameCycle ? (rowsRef.current.find((r) => r.userId === userId) ?? row) : row;
      if (turnedInDateChanged && data.extensionsRemaining < 0) {
        setExtensionDepletedWarning({
          userName: rowEntry.name?.trim() || "Unnamed user",
          remaining: data.extensionsRemaining
        });
      }

      if (sameCycle) {
        setRows((current) => current.map((entry) => (entry.userId === userId ? applyMutationToRow(entry, data) : entry)));
        setSavedRows((current) => current.map((entry) => (entry.userId === userId ? applyMutationToRow(entry, data) : entry)));
        setFailedUserId((current) => (current === userId ? null : current));
      }
      onRowChanged(applyMutationToRow(rowEntry, data), cycleNumber);
      return true;
    } catch (error) {
      if (activeCycleNumberRef.current === cycleNumber) setFailedUserId(userId);
      setMessage(error instanceof Error ? error.message : "Failed to save grade.");
      return false;
    } finally {
      setSavingUserId(null);
    }
  }

  async function togglePublish(userId: string) {
    const row = rowsRef.current.find((entry) => entry.userId === userId);
    if (!row) return false;
    const cycleNumber = activeCycleNumberRef.current;

    try {
      setPublishingUserId(userId);

      const response = await fetch("/api/grades/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setPublish",
          cycleNumber,
          userId,
          published: !row.published
        })
      });

      const payload = (await response.json()) as {
        data?: GradeMutationPayload;
        error?: { message?: string };
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to update publish state.");
      }
      const data = payload.data;

      // Same rule as saveRow: a response for a cycle that is no longer loaded leaves the rows alone.
      if (activeCycleNumberRef.current === cycleNumber) {
        setRows((current) => current.map((entry) => (entry.userId === userId ? applyMutationToRow(entry, data) : entry)));
        setSavedRows((current) => current.map((entry) => (entry.userId === userId ? applyMutationToRow(entry, data) : entry)));
      }
      onRowChanged(applyMutationToRow(row, data), cycleNumber);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update publish state.");
      return false;
    } finally {
      setPublishingUserId(null);
    }
  }

  async function saveAllRows() {
    clearAllAutosaves();

    const dirtyRows = rows.filter((row) => rowHasUnsavedChanges(row, savedRowMap.get(row.userId)));

    if (dirtyRows.length === 0) {
      return;
    }

    const cycleNumber = activeCycleNumberRef.current;
    try {
      setSavingAll(true);
      for (const row of dirtyRows) {
        // These are this cycle's rows: stop if another cycle's rows have loaded.
        if (activeCycleNumberRef.current !== cycleNumber) return;
        const success = await saveRow(row.userId);
        if (!success) {
          return;
        }
      }
    } finally {
      setSavingAll(false);
    }
  }

  async function publishAllFilledRows() {
    const filledRows = rows.filter(isRowFilledIn);

    if (filledRows.length === 0) {
      return;
    }

    const dirtyFilledRows = filledRows.filter((row) => rowHasUnsavedChanges(row, savedRowMap.get(row.userId)));
    const unpublishedFilledRows = filledRows.filter((row) => !row.published);

    if (dirtyFilledRows.length === 0 && unpublishedFilledRows.length === 0) {
      return;
    }

    const cycleNumber = activeCycleNumberRef.current;
    try {
      setPublishingAll(true);

      for (const row of dirtyFilledRows) {
        if (activeCycleNumberRef.current !== cycleNumber) return;
        const success = await saveRow(row.userId);
        if (!success) {
          return;
        }
      }

      for (const row of unpublishedFilledRows) {
        // togglePublish flips the row as it is now: stop if another cycle's rows have loaded,
        // and skip a row that is already published, so Publish all never unpublishes anything.
        if (activeCycleNumberRef.current !== cycleNumber) return;
        const current = rowsRef.current.find((entry) => entry.userId === row.userId);
        if (!current || current.published) continue;
        const success = await togglePublish(row.userId);
        if (!success) {
          return;
        }
      }
    } finally {
      setPublishingAll(false);
    }
  }

  useEffect(() => {
    if (!savingAll && !publishingAll && publishingUserId === null && pendingAutosaveUserIdsRef.current.size > 0) {
      void flushAutosavesRef.current();
    }
  }, [savingAll, publishingAll, publishingUserId]);

  // Leaving the page: a score typed in the last 700 ms still saves (like Notes), instead of
  // being dropped with its timer.
  useEffect(() => {
    const timers = autosaveTimersRef.current;
    const pending = pendingAutosaveUserIdsRef.current;
    const flush = flushAutosavesRef;
    return () => {
      for (const [userId, timer] of timers) {
        clearTimeout(timer);
        pending.add(userId);
      }
      timers.clear();
      if (pending.size > 0) void flush.current();
    };
  }, []);

  return {
    activeCycleNumber,
    rows,
    cycleAverages,
    loading,
    pendingCycleNumber,
    loadVersion,
    savingUserId,
    failedUserId,
    publishingUserId,
    savingAll,
    publishingAll,
    savingCheckIn,
    busy,
    dirtyUserIds,
    hasUnsavedChanges,
    extensionDepletedWarning,
    dismissExtensionDepletedWarning: () => setExtensionDepletedWarning(null),
    loadCycle,
    reloadCycle: (options?: { silent?: boolean }) => loadCycle(requestedCycleRef.current, options),
    updateRowAndAutosave,
    saveCheckIn,
    togglePublish,
    saveAllRows,
    publishAllFilledRows
  };
}
