"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useListHotkeys } from "@/components/kit/hotkeys";
import { readRemembered, writeRemembered } from "@/components/kit/remembered-state";
import { neighborIds } from "@/src/lib/keyboard-nav";
import {
  autoOpenId,
  defaultFilter,
  filterCounts,
  isFilterValue,
  matchesFilter,
  splitDenied,
  type FilterValue,
  type RequestView
} from "./request-view";

const FILTER_KEY = "extension-requests:filter:v1";
const HOW_KEY = "extension-requests:how:v1";
const SEEN_KEY = "extension-requests:seen:v1";

function isFilterOrNull(value: unknown): value is FilterValue | null {
  return value === null || isFilterValue(value);
}

function isBooleanOrNull(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function isTimeOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function localStore() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * A remembered choice read in a layout effect, so a list painted from the cache never shows the
 * default filter or panel for a frame first (the kit's useRememberedState applies it after paint).
 * The first render still uses `initial`, so server and client markup match.
 */
function useStoredChoice<T>(key: string, initial: T, validate: (value: unknown) => value is T) {
  const [value, setValue] = useState(initial);
  useLayoutEffect(() => {
    setValue(readRemembered(localStore(), key, initial, validate));
    // Read once per key; `initial` and `validate` are fixed for each call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const remember = useCallback(
    (next: T) => {
      setValue(next);
      writeRemembered(localStore(), key, next);
    },
    [key]
  );
  return [value, remember] as const;
}

/**
 * Queue state for the list: the status filter (Needs you first, else the remembered chip),
 * denied requests folded away in All, one open row at a time (auto-opened when it waits on you
 * or is the only one), J/K between rows, focus moves, the How it works panel, and the "updated
 * since your last visit" marks. `views` is null until the first load.
 */
export function useRequestQueue(views: RequestView[] | null) {
  const list = useMemo(() => views ?? [], [views]);
  const counts = useMemo(() => filterCounts(list), [list]);

  const [remembered, setRemembered] = useStoredChoice<FilterValue | null>(FILTER_KEY, null, isFilterOrNull);
  const [picked, setPicked] = useState<FilterValue | null>(null);
  const filter: FilterValue = picked ?? defaultFilter(counts, remembered);
  const matching = useMemo(() => list.filter((view) => matchesFilter(view, filter)), [list, filter]);

  // Old page parity: denied requests sit closed under "Denied (N)" at the bottom of All.
  const [deniedOpen, setDeniedOpen] = useState(false);
  const { shown, denied } = useMemo(() => splitDenied(matching, filter), [matching, filter]);
  // The rows J/K and auto-open move through: folded denied rows only once the fold is open.
  const visible = useMemo(() => (deniedOpen ? [...shown, ...denied] : shown), [shown, denied, deniedOpen]);

  // undefined lets the page choose (auto-open); null means the viewer closed every row.
  const [openChoice, setOpenChoice] = useState<string | null | undefined>(undefined);
  const openId = openChoice === undefined ? autoOpenId(visible) : openChoice;

  const setFilter = useCallback(
    (value: FilterValue) => {
      setPicked(value);
      setRemembered(value);
      setOpenChoice(undefined);
    },
    [setRemembered]
  );

  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusTarget = useRef<string | null>(null);

  const registerButton = useCallback((id: string, element: HTMLButtonElement | null) => {
    if (element) buttons.current.set(id, element);
    else buttons.current.delete(id);
  }, []);

  // Runs after a dialog's own focus return (Radix restores focus on a 0ms timer), so the
  // newly opened row keeps focus. It runs again once fresh data lands, so a request that a
  // decision moved out of the filter (or under the Denied fold) is brought back into view first.
  useEffect(() => {
    const id = focusTarget.current;
    if (!id || id !== openId) return;
    if (!matching.some((view) => view.entry.id === id)) {
      // Show it under All without changing the remembered chip; a request that is gone stops here.
      if (filter !== "all" && list.some((view) => view.entry.id === id)) setPicked("all");
      else focusTarget.current = null;
      return;
    }
    if (!deniedOpen && denied.some((view) => view.entry.id === id)) {
      setDeniedOpen(true);
      return;
    }
    const timer = window.setTimeout(() => {
      const element = buttons.current.get(id);
      if (!element) return;
      focusTarget.current = null;
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: "nearest" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [openId, visible, matching, list, filter, denied, deniedOpen]);

  /**
   * Opens a row and moves focus to its summary. Safe to call with a stale closure right after a
   * reload: the effect above checks the row against the data that is actually on screen.
   */
  const openAndFocus = useCallback((id: string) => {
    focusTarget.current = id;
    setOpenChoice(id);
  }, []);

  const toggle = useCallback((id: string) => setOpenChoice(openId === id ? null : id), [openId]);

  const toggleDenied = useCallback(() => {
    const closing = deniedOpen;
    setDeniedOpen(!closing);
    // Folding the open row away closes it, so J/K starts from the visible rows again.
    if (closing && denied.some((view) => view.entry.id === openId)) setOpenChoice(null);
  }, [deniedOpen, denied, openId]);

  function step(direction: 1 | -1) {
    const order = visible.map((view) => view.entry.id);
    if (order.length === 0) return;
    const inList = openId !== null && order.includes(openId);
    const around = inList ? neighborIds(order, openId) : null;
    const target = around
      ? direction === 1
        ? around.next
        : around.previous
      : direction === 1
        ? order[0]
        : order[order.length - 1];
    if (target) openAndFocus(target);
  }

  useListHotkeys({ enabled: visible.length > 0, onNext: () => step(1), onPrevious: () => step(-1) });

  const [howRemembered, setHowRemembered] = useStoredChoice<boolean | null>(HOW_KEY, null, isBooleanOrNull);
  // With no requests yet the rules are the page's content, so they stay open (and the toggle hides).
  const howForced = views !== null && views.length === 0;
  const howOpen = howForced || (howRemembered ?? false);
  const toggleHow = useCallback(() => setHowRemembered(!howOpen), [howOpen, setHowRemembered]);

  // Read the last visit once data is on screen, then stamp this one. No stamp yet = no marks.
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  const seenStamped = useRef(false);
  useEffect(() => {
    if (views === null || seenStamped.current) return;
    seenStamped.current = true;
    const storage = localStore();
    setLastSeen(readRemembered<number | null>(storage, SEEN_KEY, null, isTimeOrNull));
    writeRemembered(storage, SEEN_KEY, Date.now());
  }, [views]);

  const isNew = useCallback(
    (view: RequestView) => lastSeen !== null && view.lastActivityAt > lastSeen,
    [lastSeen]
  );

  return {
    counts,
    filter,
    setFilter,
    /** Every row the filter matches, folded or not. */
    matchingCount: matching.length,
    /** Rows above the Denied fold (all matching rows outside All). */
    shown,
    /** Denied rows folded under All; empty in every other filter. */
    denied,
    deniedOpen,
    toggleDenied,
    visible,
    openId,
    toggle,
    openAndFocus,
    registerButton,
    howOpen,
    howForced,
    toggleHow,
    isNew
  };
}
