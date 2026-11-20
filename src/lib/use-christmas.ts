"use client";

import { useSyncExternalStore } from "react";
import {
  CHRISTMAS_CHANGE_EVENT,
  CHRISTMAS_CLASS,
  CHRISTMAS_STORAGE_KEY,
  DEFAULT_CHRISTMAS_PREFS,
  parseChristmasPrefs,
  type ChristmasPrefs
} from "@/src/lib/christmas";

function subscribeClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** True while <html> has the Christmas class (in season or previewing, and not turned off). */
export function useChristmasActive(): boolean {
  return useSyncExternalStore(
    subscribeClass,
    () => document.documentElement.classList.contains(CHRISTMAS_CLASS),
    () => false
  );
}

function subscribePrefs(onChange: () => void) {
  window.addEventListener(CHRISTMAS_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHRISTMAS_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// useSyncExternalStore needs the same object back until the stored string changes.
let cached: { raw: string | null; prefs: ChristmasPrefs } = { raw: null, prefs: DEFAULT_CHRISTMAS_PREFS };

function getPrefsSnapshot(): ChristmasPrefs {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CHRISTMAS_STORAGE_KEY);
  } catch {
    return cached.prefs;
  }
  if (raw !== cached.raw) cached = { raw, prefs: parseChristmasPrefs(raw) };
  return cached.prefs;
}

/** This browser's Christmas preferences, kept in sync across the tab and other tabs. */
export function useChristmasPrefs(): ChristmasPrefs {
  return useSyncExternalStore(subscribePrefs, getPrefsSnapshot, () => DEFAULT_CHRISTMAS_PREFS);
}
