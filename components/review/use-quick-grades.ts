"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaReviewDto } from "@/src/lib/types";
import {
  buildQuickGradeRows,
  commonQuickGradeTurnedInDate,
  fetchQuickGradeRows,
  publishQuickGradeRows,
  quickGradePublishMessage,
  quickGradeRevisionDeadlineLabel,
  quickGradeSaveMessage,
  saveQuickGradeRows,
  type QuickGradeRow
} from "@/components/review/quick-grades";

export type QuickGradesState = ReturnType<typeof useQuickGrades>;

/**
 * Quick grades state. It lives in ReviewShell (not in the panel or sheet that shows it), so row
 * edits survive closing and reopening (rows load once per cycle). Closing drops an unsaved change
 * to the shared Turned in date (it goes back to the rows' common date), so a date picked and then
 * abandoned is never applied to everyone by a later Save or Publish.
 */
export function useQuickGrades({
  enabled,
  cycleNumber,
  assignedPeople
}: {
  enabled: boolean;
  cycleNumber: number | null;
  assignedPeople: MediaReviewDto["assignedPeople"];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<QuickGradeRow[]>([]);
  const [savedRows, setSavedRows] = useState<QuickGradeRow[]>([]);
  const [loadedCycle, setLoadedCycle] = useState<number | null>(null);
  const [sharedTurnedInDate, setSharedTurnedInDateValue] = useState("");
  const [sharedTurnedInDirty, setSharedTurnedInDirty] = useState(false);
  const [feedbackEditorUserId, setFeedbackEditorUserId] = useState<string | null>(null);
  // Read by close(), which stays stable (ReviewShell closes on every version change).
  const rowsRef = useRef(rows);

  useEffect(() => {
    rowsRef.current = rows;
  });

  const load = useCallback(
    async (cycle: number) => {
      setLoading(true);
      setMessage(null);
      try {
        const nextRows = buildQuickGradeRows(assignedPeople, await fetchQuickGradeRows(cycle));
        setRows(nextRows);
        setSavedRows(nextRows);
        setLoadedCycle(cycle);
        setSharedTurnedInDateValue(commonQuickGradeTurnedInDate(nextRows));
        setSharedTurnedInDirty(false);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Failed to load grades.");
      } finally {
        setLoading(false);
      }
    },
    [assignedPeople]
  );

  const show = useCallback(() => {
    if (!enabled) {
      return;
    }
    setOpen(true);
    setMessage(null);
    if (cycleNumber && loadedCycle !== cycleNumber) {
      void load(cycleNumber);
    }
  }, [cycleNumber, enabled, load, loadedCycle]);

  const close = useCallback(() => {
    setOpen(false);
    setFeedbackEditorUserId(null);
    setSharedTurnedInDirty(false);
    setSharedTurnedInDateValue(commonQuickGradeTurnedInDate(rowsRef.current));
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      close();
    } else {
      show();
    }
  }, [close, open, show]);

  const updateRow = useCallback((userId: string, patch: Partial<QuickGradeRow>) => {
    setRows((current) => current.map((row) => (row.userId === userId ? { ...row, ...patch } : row)));
  }, []);

  const setSharedTurnedInDate = useCallback((value: string) => {
    setSharedTurnedInDateValue(value);
    setSharedTurnedInDirty(true);
  }, []);

  const save = useCallback(
    async (options?: { quiet?: boolean }) => {
      if (!enabled || !cycleNumber) {
        return { ok: false as const, rows };
      }
      setSaving(true);
      setMessage(null);
      try {
        const result = await saveQuickGradeRows({
          rows,
          savedRows,
          cycleNumber,
          sharedTurnedInDate: sharedTurnedInDirty ? sharedTurnedInDate : null
        });
        setRows(result.rows);
        setSavedRows(result.savedRows);
        setSharedTurnedInDirty(false);
        setSharedTurnedInDateValue(commonQuickGradeTurnedInDate(result.rows));
        if (!options?.quiet) {
          setMessage(quickGradeSaveMessage(result));
        }
        return { ok: true as const, rows: result.rows };
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Failed to save grades.");
        return { ok: false as const, rows };
      } finally {
        setSaving(false);
      }
    },
    [cycleNumber, enabled, rows, savedRows, sharedTurnedInDate, sharedTurnedInDirty]
  );

  const publish = useCallback(async () => {
    if (!enabled || !cycleNumber) {
      return;
    }
    const saved = await save({ quiet: true });
    if (!saved.ok) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await publishQuickGradeRows({ rows: saved.rows, cycleNumber });
      setRows(result.rows);
      setSavedRows(result.rows);
      setSharedTurnedInDateValue(commonQuickGradeTurnedInDate(result.rows));
      setMessage(quickGradePublishMessage(result));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to publish grades.");
    } finally {
      setSaving(false);
    }
  }, [cycleNumber, enabled, save]);

  const revisionDeadlineLabel = useMemo(() => quickGradeRevisionDeadlineLabel(rows), [rows]);

  return {
    enabled,
    cycleNumber,
    open,
    loading,
    saving,
    message,
    rows,
    sharedTurnedInDate,
    feedbackEditorUserId,
    revisionDeadlineLabel,
    show,
    close,
    toggle,
    updateRow,
    setSharedTurnedInDate,
    setFeedbackEditorUserId,
    save,
    publish
  };
}
