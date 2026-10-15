"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import {
  type GridCells,
  MAX_FALLBACK,
  NOTE_MAX,
  PARTICIPATION_REQUESTS_CHANGED_EVENT,
  type QueueRequest,
  type WeekData,
  baselineFromWeek,
  buildSavePayload,
  clampPoints,
  entryKey,
  fullWeekPoints,
  rebaseCells,
  startOfWeek,
  toDateKey
} from "./participation-week";

/** One loaded week: the server copy, what the grid was built from, and the viewer's drafts. */
type Sheet = { key: string; data: WeekData; baseline: GridCells; drafts: GridCells };

const EMPTY_CELLS: GridCells = { points: {}, notes: {} };

function cacheKey(weekStartKey: string) {
  return `participation:${weekStartKey}`;
}

function sheetFor(key: string, data: WeekData, previous?: Sheet | null, reference?: GridCells): Sheet {
  const baseline = baselineFromWeek(data);
  if (!previous || previous.key !== key) {
    return { key, data, baseline, drafts: { points: { ...baseline.points }, notes: { ...baseline.notes } } };
  }
  return { key, data, baseline, drafts: rebaseCells(baseline, previous.drafts, reference ?? previous.baseline) };
}

function announceRequestsChanged() {
  window.dispatchEvent(new Event(PARTICIPATION_REQUESTS_CHANGED_EVENT));
}

/**
 * The Participation week: GET /api/participation for the shown week (the last copy shows at once,
 * then a quiet refresh), drafts that survive refreshes, Save (POST) and the pending queue
 * (GET/PATCH /api/participation/requests — fetched only when the Pending view asks for it). Every
 * load is tagged with its week and a sequence number, so a slow response for another week can
 * never land under the current label.
 */
export function useParticipationWeek() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekStartKey = toDateKey(weekStart);
  const [sheet, setSheet] = useState<Sheet | null>(() => {
    const cached = cachedValue<WeekData>(cacheKey(weekStartKey));
    return cached ? sheetFor(weekStartKey, cached) : null;
  });
  const [fetchingKey, setFetchingKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  // Every pending request, whatever the week (the server counts them all), from the newest load.
  // Kept apart from the week so it stays on the Pending control while another week loads.
  const [pendingCount, setPendingCount] = useState<number | null>(() => sheet?.data.pendingCount ?? null);
  const [saving, setSaving] = useState(false);
  const [queue, setQueue] = useState<QueueRequest[] | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const loadSeqRef = useRef(0);
  const latestLoadRef = useRef(new Map<string, number>());
  const weekKeyRef = useRef(weekStartKey);
  const queueSeqRef = useRef(0);
  const sheetRef = useRef(sheet);

  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  const load = useCallback(async (key: string, reference?: GridCells) => {
    const seq = ++loadSeqRef.current;
    latestLoadRef.current.set(key, seq);
    // Only the newest load of the week on screen may touch state; anything else is stale.
    const current = () => key === weekKeyRef.current && latestLoadRef.current.get(key) === seq;
    if (current()) setFetchingKey(key);
    try {
      const response = await fetch(`/api/participation?weekStart=${key}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to load participation.");
      }
      const week = payload.data as WeekData;
      rememberValue(cacheKey(key), week);
      if (!current()) return;
      setSheet((previous) => sheetFor(key, week, previous, reference));
      setPendingCount(week.pendingCount ?? 0);
      setLoadError(null);
    } catch (error) {
      if (!current()) return;
      const message = error instanceof Error ? error.message : "Failed to load participation.";
      // With nothing on screen the page shows this in an Alert with Try again; a failed quiet
      // refresh of a week already shown only gets a toast.
      if (sheetRef.current?.key === key) toast.error(message);
      setLoadError({ key, message });
    } finally {
      if (current()) setFetchingKey(null);
    }
  }, []);

  useEffect(() => {
    void load(weekStartKey);
  }, [weekStartKey, load]);

  const loadQueue = useCallback(async (options: { silent?: boolean } = {}) => {
    const seq = ++queueSeqRef.current;
    setQueueLoading(true);
    try {
      const response = await fetch("/api/participation/requests", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to load pending requests.");
      }
      if (seq !== queueSeqRef.current) return;
      setQueue((payload.data?.requests ?? []) as QueueRequest[]);
      setQueueError(null);
    } catch (error) {
      if (seq !== queueSeqRef.current) return;
      const message = error instanceof Error ? error.message : "Failed to load pending requests.";
      setQueueError(message);
      if (!options.silent) toast.error(message);
    } finally {
      if (seq === queueSeqRef.current) setQueueLoading(false);
    }
  }, []);

  /** Moves to the week containing `date`; drafts of the old week are dropped (the page confirms first). */
  const changeWeek = useCallback(
    (date: Date) => {
      const start = startOfWeek(date);
      const key = toDateKey(start);
      if (key === weekStartKey) return;
      const cached = cachedValue<WeekData>(cacheKey(key));
      weekKeyRef.current = key;
      setWeekStart(start);
      setSheet(cached ? sheetFor(key, cached) : null);
    },
    [weekStartKey]
  );

  const ready = sheet !== null && sheet.key === weekStartKey;
  const data = ready ? sheet.data : null;

  const maxByDate = useMemo(
    () => new Map((data?.maxPointsByDate ?? []).map((limit) => [limit.date, limit.maxPoints])),
    [data]
  );
  const maxFor = useCallback((dateKey: string) => maxByDate.get(dateKey) ?? MAX_FALLBACK, [maxByDate]);

  const updateDrafts = useCallback((update: (drafts: GridCells) => GridCells) => {
    setSheet((previous) => (previous ? { ...previous, drafts: update(previous.drafts) } : previous));
  }, []);

  const setPoints = useCallback(
    (userId: string, dateKey: string, raw: string) => {
      const points = clampPoints(raw, maxFor(dateKey));
      updateDrafts((drafts) => ({ ...drafts, points: { ...drafts.points, [entryKey(userId, dateKey)]: points } }));
    },
    [maxFor, updateDrafts]
  );

  const fillWeek = useCallback(
    (userId: string, fillOffDays = false) => {
      updateDrafts((drafts) => ({
        ...drafts,
        points: fullWeekPoints(drafts.points, userId, weekStart, maxFor, fillOffDays)
      }));
    },
    [weekStart, maxFor, updateDrafts]
  );

  const fillDay = useCallback(
    (dateKey: string, studentIds: string[]) => {
      const max = maxFor(dateKey);
      const filled = Object.fromEntries(studentIds.map((id) => [entryKey(id, dateKey), max]));
      updateDrafts((drafts) => ({ ...drafts, points: { ...drafts.points, ...filled } }));
    },
    [maxFor, updateDrafts]
  );

  const setNote = useCallback(
    (userId: string, dateKey: string, notes: string) => {
      updateDrafts((drafts) => ({
        ...drafts,
        notes: { ...drafts.notes, [entryKey(userId, dateKey)]: notes.slice(0, NOTE_MAX) }
      }));
    },
    [updateDrafts]
  );

  /** `reloadQueue`: also refresh the pending queue (when it is on screen). */
  async function save(options: { reloadQueue?: boolean } = {}) {
    const current = sheetRef.current;
    if (!current || current.key !== weekStartKey) return;
    const snapshot = current.drafts;
    setSaving(true);
    try {
      const response = await fetch("/api/participation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: buildSavePayload(snapshot) })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to save participation.");
      }

      const result = payload.data as { pending?: boolean; itemCount?: number; saved?: number; emailed?: boolean };
      const saved = result.saved ?? 0;
      const queued = result.pending ? (result.itemCount ?? 0) : 0;
      const mailed = result.emailed ? " The adviser and other executive producers were emailed." : "";
      if (saved > 0 && queued > 0) {
        toast.success(
          `Saved ${saved} full-mark score${saved === 1 ? "" : "s"}. Sent ${queued} docked score${queued === 1 ? "" : "s"} for approval.${mailed}`
        );
      } else if (queued > 0) {
        toast.success(
          `Sent ${queued} docked score${queued === 1 ? "" : "s"} for the adviser or another producer to approve.${mailed}`
        );
      } else if (saved > 0) {
        toast.success("Participation saved.");
      } else {
        toast.message("No participation changes to submit.");
      }
      announceRequestsChanged();
      // Edits made while the save was out stay; everything that was sent takes the server's copy.
      await Promise.all([load(current.key, snapshot), options.reloadQueue ? loadQueue({ silent: true }) : null]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save participation.");
    } finally {
      setSaving(false);
    }
  }

  async function decide(requestId: string, approved: boolean) {
    setDecidingId(requestId);
    try {
      const response = await fetch("/api/participation/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, approved })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to review request.");
      }
      toast.success(approved ? "Participation grades posted." : "Request denied. Live scores unchanged.");
      announceRequestsChanged();
      // Unsaved grid edits survive: the refresh only replaces cells nobody touched.
      await Promise.all([load(weekStartKey), loadQueue()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to review request.");
    } finally {
      setDecidingId(null);
    }
  }

  return {
    weekStart,
    weekStartKey,
    changeWeek,
    data,
    drafts: ready ? sheet.drafts : EMPTY_CELLS,
    baseline: ready ? sheet.baseline : EMPTY_CELLS,
    /** No copy of this week yet (skeleton). */
    loading: !ready && loadError?.key !== weekStartKey,
    /** A quiet refresh of the shown week is running. */
    refreshing: ready && fetchingKey === weekStartKey,
    fetching: fetchingKey === weekStartKey,
    loadError: loadError?.key === weekStartKey ? loadError.message : null,
    reload: () => load(weekStartKey),
    /** Every pending request (the Pending control's count); null until the first load. */
    pendingCount,
    maxFor,
    setPoints,
    fillWeek,
    fillDay,
    setNote,
    saving,
    save,
    queue,
    queueLoading,
    queueError,
    loadQueue,
    decidingId,
    decide
  };
}
