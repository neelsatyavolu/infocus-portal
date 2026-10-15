import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { isDashTab, saveView, type DashTab, type SaveView } from "./live-status";

/** Per browser tab: a reload mid-game keeps the tab; a new game day opens on Scoreboard. */
const TAB_STORAGE_KEY = "live-dashboard:tab";
const SAVE_VIEW_TICK_MS = 250;

const subscribeToNothing = () => () => {};

function readSavedTab(): DashTab | null {
  try {
    const saved = window.sessionStorage.getItem(TAB_STORAGE_KEY);
    return isDashTab(saved) ? saved : null;
  } catch {
    // Storage blocked: the tab just isn't remembered.
    return null;
  }
}

/**
 * The dashboard tab, remembered in sessionStorage. Read after mount, so the first render matches
 * the server; blocked storage just means the tab isn't remembered.
 */
export function useRememberedTab(initial: DashTab) {
  const saved = useSyncExternalStore(subscribeToNothing, readSavedTab, () => null);
  const [picked, setPicked] = useState<DashTab | null>(null);
  const tab = picked ?? saved ?? initial;

  const selectTab = useCallback((next: DashTab) => {
    setPicked(next);
    try {
      window.sessionStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the tab just isn't remembered.
    }
  }, []);

  return [tab, selectTab] as const;
}

export type SaveSnapshot = { pending: boolean; retrying: boolean; failed: boolean; savedOnce: boolean };

/**
 * Mirrors the scoreboard save queue into a SaveView for the status tags. `read` returns the queue's
 * refs as a snapshot (keep it stable with useCallback); this never touches the queue. It only
 * ticks while a livestream is open.
 */
export function useSaveView(read: () => SaveSnapshot, active: boolean): SaveView {
  const [view, setView] = useState<SaveView>("idle");

  useEffect(() => {
    if (!active) return;
    let pendingSince: number | null = null;
    const id = window.setInterval(() => {
      const snapshot = read();
      const now = Date.now();
      if (!snapshot.pending) pendingSince = null;
      else if (pendingSince === null) pendingSince = now;
      setView(saveView({ ...snapshot, pendingForMs: pendingSince === null ? 0 : now - pendingSince }));
    }, SAVE_VIEW_TICK_MS);
    return () => window.clearInterval(id);
  }, [active, read]);

  return active ? view : "idle";
}
