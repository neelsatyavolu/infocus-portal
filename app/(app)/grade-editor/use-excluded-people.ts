"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "grade-editor:missing-excluded:v1";

function readStored(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    // Corrupt or unavailable storage: fail soft to an empty exclusion set.
    return [];
  }
}

/**
 * Remembers which people the admin has chosen to exclude from the Missing Grades
 * list. Persisted per-browser in localStorage. Toggling is used for both excluding
 * and restoring a person.
 */
export function useExcludedPeople() {
  const [loaded, setLoaded] = useState(false);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  useEffect(() => {
    setExcludedIds(readStored());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(excludedIds));
    } catch {
      // Storage may be unavailable (private mode / quota); skip persistence.
    }
  }, [excludedIds, loaded]);

  function toggleExcluded(userId: string) {
    setExcludedIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  }

  function isExcluded(userId: string) {
    return excludedIds.includes(userId);
  }

  return { excludedIds, toggleExcluded, isExcluded };
}
