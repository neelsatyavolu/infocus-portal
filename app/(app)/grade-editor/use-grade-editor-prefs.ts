"use client";

import { useEffect, useState } from "react";
import { readRemembered, useRememberedState, writeRemembered } from "@/components/kit/remembered-state";
import type { CycleFilter, SortBy } from "./grade-editor-types";
import { isCycleFilter, parseViewKey, type ViewKey } from "./grade-editor-utils";

/** Raw string, unprefixed: kept byte-identical so people keep their sort. */
const SORT_STORAGE_KEY = "grade-editor:sort-by:v1";
const VIEW_STORAGE_KEY = "grade-editor:view:v1";
const FILTER_STORAGE_KEY = "grade-editor:filter:v1";

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isViewKey(value: unknown): value is ViewKey {
  return parseViewKey(value) !== null;
}

/** The view to open on: the remembered one, or null on a first visit. Client only. */
export function readStoredView() {
  return parseViewKey(readRemembered<ViewKey | null>(browserStorage(), VIEW_STORAGE_KEY, null, isViewKey));
}

export function writeStoredView(key: ViewKey) {
  writeRemembered(browserStorage(), VIEW_STORAGE_KEY, key);
}

/** Sort (first or last name) and the cycle filter chip, remembered per browser. */
export function useGradeEditorPrefs() {
  const [sortBy, setSortBy] = useState<SortBy>("firstName");
  const [sortLoaded, setSortLoaded] = useState(false);
  const [cycleFilter, setCycleFilter] = useRememberedState<CycleFilter>(FILTER_STORAGE_KEY, "all", isCycleFilter);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SORT_STORAGE_KEY);
      if (stored === "firstName" || stored === "lastName") {
        setSortBy(stored);
      }
    } catch {
      // Storage unavailable (private mode); keep the default sort.
    }
    setSortLoaded(true);
  }, []);

  useEffect(() => {
    if (!sortLoaded) {
      return;
    }
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, sortBy);
    } catch {
      // Storage may be unavailable (private mode / quota); skip persistence.
    }
  }, [sortBy, sortLoaded]);

  return { sortBy, setSortBy, cycleFilter, setCycleFilter };
}
