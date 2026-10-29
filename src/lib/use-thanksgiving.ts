"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THANKSGIVING_PREFS,
  parseThanksgivingPrefs,
  THANKSGIVING_CHANGE_EVENT,
  THANKSGIVING_CLASS,
  THANKSGIVING_STORAGE_KEY,
  type ThanksgivingPrefs
} from "@/src/lib/thanksgiving";

function subscribeClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** True while <html> has the Thanksgiving class (in season or previewing, and not turned off). */
export function useThanksgivingActive(): boolean {
  return useSyncExternalStore(
    subscribeClass,
    () => document.documentElement.classList.contains(THANKSGIVING_CLASS),
    () => false
  );
}

function subscribePrefs(onChange: () => void) {
  window.addEventListener(THANKSGIVING_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THANKSGIVING_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// useSyncExternalStore needs the same object back until the stored string changes.
let cached: { raw: string | null; prefs: ThanksgivingPrefs } = { raw: null, prefs: DEFAULT_THANKSGIVING_PREFS };

function getPrefsSnapshot(): ThanksgivingPrefs {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(THANKSGIVING_STORAGE_KEY);
  } catch {
    return cached.prefs;
  }
  if (raw !== cached.raw) cached = { raw, prefs: parseThanksgivingPrefs(raw) };
  return cached.prefs;
}

/** This browser's Thanksgiving preferences, kept in sync across the tab and other tabs. */
export function useThanksgivingPrefs(): ThanksgivingPrefs {
  return useSyncExternalStore(subscribePrefs, getPrefsSnapshot, () => DEFAULT_THANKSGIVING_PREFS);
}
