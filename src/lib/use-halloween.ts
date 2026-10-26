"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_HALLOWEEN_PREFS,
  HALLOWEEN_CHANGE_EVENT,
  HALLOWEEN_CLASS,
  HALLOWEEN_STORAGE_KEY,
  parseHalloweenPrefs,
  type HalloweenPrefs
} from "@/src/lib/halloween";

function subscribeClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** True while <html> has the Halloween class (in season and not turned off in this browser). */
export function useHalloweenActive(): boolean {
  return useSyncExternalStore(
    subscribeClass,
    () => document.documentElement.classList.contains(HALLOWEEN_CLASS),
    () => false
  );
}

function subscribePrefs(onChange: () => void) {
  window.addEventListener(HALLOWEEN_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(HALLOWEEN_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// useSyncExternalStore needs the same object back until the stored string changes.
let cached: { raw: string | null; prefs: HalloweenPrefs } = { raw: null, prefs: DEFAULT_HALLOWEEN_PREFS };

function getPrefsSnapshot(): HalloweenPrefs {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(HALLOWEEN_STORAGE_KEY);
  } catch {
    return cached.prefs;
  }
  if (raw !== cached.raw) cached = { raw, prefs: parseHalloweenPrefs(raw) };
  return cached.prefs;
}

/** This browser's Halloween preferences, kept in sync across the tab and other tabs. */
export function useHalloweenPrefs(): HalloweenPrefs {
  return useSyncExternalStore(subscribePrefs, getPrefsSnapshot, () => DEFAULT_HALLOWEEN_PREFS);
}
