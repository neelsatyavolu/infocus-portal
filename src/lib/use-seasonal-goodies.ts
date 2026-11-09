"use client";

import { useSyncExternalStore } from "react";
import {
  parseSeasonalGoodiesOn,
  SEASONAL_GOODIES_CHANGE_EVENT,
  SEASONAL_GOODIES_STORAGE_KEY
} from "@/src/lib/seasonal-goodies";

function subscribe(onChange: () => void) {
  window.addEventListener(SEASONAL_GOODIES_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SEASONAL_GOODIES_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): boolean {
  try {
    return parseSeasonalGoodiesOn(window.localStorage.getItem(SEASONAL_GOODIES_STORAGE_KEY));
  } catch {
    return true;
  }
}

/** Whether this browser wants holiday extras (visitors, sounds, surprises), kept in sync across tabs. */
export function useSeasonalGoodiesOn(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
