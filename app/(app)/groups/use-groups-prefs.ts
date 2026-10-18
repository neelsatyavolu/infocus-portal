"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useRememberedState } from "@/components/kit/remembered-state";

export type ViewMode = "cards" | "chart";

/** Kept as-is (raw "cards" | "chart", no prefix) so choices saved before the redesign survive. */
const VIEW_MODE_STORAGE_KEY = "groups:view-mode:v1";

function subscribeNever() {
  return () => undefined;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isCycleNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value));
}

/**
 * Per-browser Groups choices: Tiles or Progress, whether Other groups is open, and the last cycle
 * picked. All are read after mount, so the server and first client render match. The filter is not
 * remembered on purpose: Needs you already comes first, and a remembered filter would make the board
 * jump.
 */
export function useGroupsPrefs() {
  const [viewMode, setViewModeState] = useState<ViewMode>("cards");
  const [viewModeRead, setViewModeRead] = useState(false);
  const [otherOpen, setOtherOpen] = useRememberedState<boolean>("groups:other-open:v1", false, isBoolean);
  const [lastCycle, setLastCycle, lastCycleLoaded] = useRememberedState<number | null>(
    "groups:last-cycle:v1",
    null,
    isCycleNumber
  );
  // False on the server and while hydrating, so the first render matches the server's.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);

  if (hydrated && !viewModeRead) {
    setViewModeRead(true);
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored === "cards" || stored === "chart") setViewModeState(stored);
    } catch {
      // Storage unavailable (private mode); keep the default view.
    }
  }

  const setViewMode = useCallback((next: ViewMode) => {
    setViewModeState(next);
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable (private mode / quota); skip persistence.
    }
  }, []);

  return { viewMode, setViewMode, otherOpen, setOtherOpen, lastCycle, setLastCycle, lastCycleLoaded };
}
