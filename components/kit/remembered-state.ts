"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** All remembered UI state lives under one prefix, so it's easy to find and clear. */
export const REMEMBERED_PREFIX = "infocus:ui:";

/**
 * Reads a remembered value. Missing, unreadable (private mode, blocked storage), unparsable or
 * invalid values all fall back, so callers never see a broken value.
 */
export function readRemembered<T>(
  storage: StorageLike | null | undefined,
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T
): T {
  try {
    const raw = storage?.getItem(REMEMBERED_PREFIX + key);
    if (raw === null || raw === undefined) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (validate) return validate(parsed) ? parsed : fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** Writes a remembered value; a full or blocked storage is ignored (it just won't be remembered). */
export function writeRemembered(storage: StorageLike | null | undefined, key: string, value: unknown) {
  try {
    storage?.setItem(REMEMBERED_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full: the choice applies for this visit only.
  }
}

function subscribeNever() {
  return () => undefined;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * useState that remembers its value per browser (remembered tabs, filters, views, collapsed
 * sections). The first render uses `initial` (same on server and client, so no hydration
 * mismatch); the stored value is applied once hydrated, and `loaded` turns true then.
 * Version the key ("groups:filter:v1") when the shape of the value changes. An empty key turns
 * storage off (plain useState), for components where remembering is optional.
 */
export function useRememberedState<T>(
  key: string,
  initial: T,
  validate?: (value: unknown) => value is T
): [T, (next: T | ((previous: T) => T)) => void, boolean] {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  // `readKey`: the key whose stored value has been applied. Re-read only when the key changes.
  const [state, setState] = useState<{ value: T; loaded: boolean; readKey: string }>({
    value: initial,
    loaded: false,
    readKey: ""
  });

  if (hydrated && key && state.readKey !== key) {
    setState({ value: readRemembered(browserStorage(), key, initial, validate), loaded: true, readKey: key });
  }

  const setValue = useCallback(
    (next: T | ((previous: T) => T)) => {
      setState((previous) => {
        const value = typeof next === "function" ? (next as (previous: T) => T)(previous.value) : next;
        if (key) writeRemembered(browserStorage(), key, value);
        return { ...previous, value, loaded: true };
      });
    },
    [key]
  );

  return [state.value, setValue, state.loaded];
}

/**
 * Matches a media query (`"(min-width: 1024px)"`) without a duplicate layout in the DOM. The
 * server and first client render use `serverValue` (desktop by default), then it follows the
 * real viewport.
 */
export function useMediaQuery(query: string, serverValue = true) {
  return useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
        const list = window.matchMedia(query);
        list.addEventListener("change", onChange);
        return () => list.removeEventListener("change", onChange);
      },
      [query]
    ),
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : serverValue),
    () => serverValue
  );
}
