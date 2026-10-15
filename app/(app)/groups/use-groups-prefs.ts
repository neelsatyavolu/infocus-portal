"use client";

import { useCallback, useEffect, useState } from "react";
import { useRememberedState } from "@/components/kit/remembered-state";

export type ViewMode = "cards" | "chart";

/** Kept as-is (raw "cards" | "chart", no prefix) so choices saved before the redesign survive. */
const VIEW_MODE_STORAGE_KEY = "groups:view-mode:v1";

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * Per-browser Groups choices: Tiles or Progress, and whether Other groups is open. Both are read
 * after mount, so the server and first client render match. The filter is not remembered on
 * purpose: Needs you already comes first, and a remembered filter would make the board jump.
 */
export function useGroupsPrefs() {
  const [viewMode, setViewModeState] = useState<ViewMode>("cards");
  const [otherOpen, setOtherOpen] = useRememberedState<boolean>("groups:other-open:v1", false, isBoolean);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored === "cards" || stored === "chart") setViewModeState(stored);
    } catch {
      // Storage unavailable (private mode); keep the default view.
    }
  }, []);

  const setViewMode = useCallback((next: ViewMode) => {
    setViewModeState(next);
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable (private mode / quota); skip persistence.
    }
  }, []);

  return { viewMode, setViewMode, otherOpen, setOtherOpen };
}
