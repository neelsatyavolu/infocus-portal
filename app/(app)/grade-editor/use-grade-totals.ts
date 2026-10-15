"use client";

import { useRef, useState } from "react";
import { defaultTotalsAdjustments, type TotalsAdjustments } from "@/src/lib/grade-editor-csv";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { fetchTotals, TOTALS_CACHE_KEY } from "./grade-editor-api";
import type { CycleTab, TotalsPayload, TotalsRow } from "./grade-editor-types";
import { mergeTotalsAdjustments } from "./grade-editor-utils";

export type NotesSaveState = "dirty" | "saving" | "saved" | "error";

/**
 * The Total view: totals rows, the temporary adjustments typed on the page (kept across
 * reloads), and the per-reporter Notes save (600 ms debounce). Notes timers are not cleared on
 * unmount, so a note typed just before leaving still saves.
 */
export function useGradeTotals({
  setMessage,
  onCycles
}: {
  setMessage: (message: string | null) => void;
  onCycles: (cycles: CycleTab[]) => void;
}) {
  const [totalsRows, setTotalsRows] = useState<TotalsRow[]>([]);
  const [checkInPossible, setCheckInPossible] = useState(0);
  const [totalsLoading, setTotalsLoading] = useState(false);
  const [totalsRefreshing, setTotalsRefreshing] = useState(false);
  /** The first load finished (or cached totals were shown), whether or not it worked. */
  const [totalsSettled, setTotalsSettled] = useState(false);
  const [totalsAdjustments, setTotalsAdjustments] = useState<Map<string, TotalsAdjustments>>(new Map());
  const [notesState, setNotesState] = useState<Record<string, NotesSaveState>>({});
  const staleCheckInTotalsRef = useRef(new Set<string>());
  const notesSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** The rows the current adjustments were seeded from (so fresh official credits replace them). */
  const seedRowsRef = useRef(new Map<string, TotalsRow>());

  function applyTotals(data: TotalsPayload) {
    onCycles(data.cycles);
    setCheckInPossible(data.checkInPossible ?? 0);
    setTotalsRows(data.totalsRows);
    const staleCheckIns = new Set(staleCheckInTotalsRef.current);
    staleCheckInTotalsRef.current.clear();
    const previousRows = seedRowsRef.current;
    seedRowsRef.current = new Map(data.totalsRows.map((row) => [row.userId, row]));
    const pendingNotes = new Set(notesSaveTimersRef.current.keys());
    setTotalsAdjustments((current) => {
      const next = new Map(current);
      for (const row of data.totalsRows) {
        next.set(
          row.userId,
          mergeTotalsAdjustments({
            existing: next.get(row.userId),
            previous: previousRows.get(row.userId),
            row,
            checkInStale: staleCheckIns.has(row.userId),
            // A note still waiting to save keeps what was typed.
            keepNotes: pendingNotes.has(row.userId)
          })
        );
      }
      return next;
    });
  }

  /** Shows the last-seen totals at once (returning to the page). True when there were some. */
  function hydrateFromCache() {
    const cached = cachedValue<TotalsPayload>(TOTALS_CACHE_KEY);
    if (!cached) return false;
    applyTotals(cached);
    setTotalsSettled(true);
    return true;
  }

  async function loadTotals(options?: { silent?: boolean }) {
    try {
      if (!options?.silent) setTotalsLoading(true);
      else setTotalsRefreshing(true);
      setMessage(null);
      const data = await fetchTotals();
      rememberValue(TOTALS_CACHE_KEY, data);
      applyTotals(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load totals.");
    } finally {
      if (!options?.silent) setTotalsLoading(false);
      else setTotalsRefreshing(false);
      setTotalsSettled(true);
    }
  }

  function getAdjustments(userId: string): TotalsAdjustments {
    return totalsAdjustments.get(userId) ?? defaultTotalsAdjustments();
  }

  function updateAdjustment(userId: string, patch: Partial<TotalsAdjustments>) {
    setTotalsAdjustments((current) => {
      const next = new Map(current);
      const existing = next.get(userId) ?? defaultTotalsAdjustments();
      next.set(userId, { ...existing, ...patch });
      return next;
    });
  }

  function setNoteState(userId: string, state: NotesSaveState) {
    setNotesState((current) => ({ ...current, [userId]: state }));
  }

  function scheduleNotesSave(userId: string, notes: string) {
    const existing = notesSaveTimersRef.current.get(userId);
    if (existing) clearTimeout(existing);
    setNoteState(userId, "dirty");
    const timer = setTimeout(async () => {
      notesSaveTimersRef.current.delete(userId);
      setNoteState(userId, "saving");
      try {
        const response = await fetch(`/api/grades/admin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "setTotalNotes", userId, notes })
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(payload.error?.message ?? "Failed to save notes.");
        }
        setTotalsRows((rows) => rows.map((row) => (row.userId === userId ? { ...row, notes } : row)));
        setNoteState(userId, "saved");
      } catch (error) {
        setNoteState(userId, "error");
        setMessage(error instanceof Error ? error.message : "Failed to save notes.");
      }
    }, 600);
    notesSaveTimersRef.current.set(userId, timer);
  }

  function updateNotes(userId: string, notes: string) {
    updateAdjustment(userId, { notes });
    scheduleNotesSave(userId, notes);
  }

  function markCheckInStale(userId: string) {
    staleCheckInTotalsRef.current.add(userId);
  }

  return {
    totalsRows,
    checkInPossible,
    totalsLoading,
    totalsRefreshing,
    totalsSettled,
    totalsAdjustments,
    notesState,
    hydrateFromCache,
    loadTotals,
    getAdjustments,
    updateAdjustment,
    updateNotes,
    markCheckInStale
  };
}
