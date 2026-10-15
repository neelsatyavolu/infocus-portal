"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { readRemembered, writeRemembered } from "@/components/kit/remembered-state";
import {
  isSeenMap,
  seenChanges,
  seenMapOf,
  type SeenChange,
  type SeenItem,
  type SeenMap
} from "@/components/grades/grades-seen";

/** localStorage, or null when it is blocked (private mode, disabled site data). */
function browserStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isSeenMapOrNull(value: unknown): value is SeenMap | null {
  return value === null || isSeenMap(value);
}

/**
 * Compares the loaded grades with what this browser showed last time (per person, by
 * `storageKey`), once per load, after mount (no hydration mismatch). It records the current
 * signatures straight away, so the "New" tags last for this visit only.
 */
export function useGradesSeen({
  items,
  ready,
  storageKey
}: {
  items: SeenItem[];
  /** False until grades are loaded, so an empty list is never recorded as "seen". */
  ready: boolean;
  /** Empty turns tracking off. */
  storageKey: string;
}): SeenChange[] {
  const [changes, setChanges] = useState<SeenChange[]>([]);
  const handled = useRef<string | null>(null);
  const fingerprint = useMemo(() => JSON.stringify(items.map((item) => [item.key, item.signature])), [items]);

  useEffect(() => {
    if (!ready || !storageKey) return;
    // Once per load: a re-run (Strict Mode, same data) must not compare against what we just wrote.
    const marker = `${storageKey}\n${fingerprint}`;
    if (handled.current === marker) return;
    handled.current = marker;

    const storage = browserStorage();
    const stored = readRemembered<SeenMap | null>(storage, storageKey, null, isSeenMapOrNull);
    setChanges(seenChanges(stored, items));
    writeRemembered(storage, storageKey, seenMapOf(items));
  }, [ready, storageKey, fingerprint, items]);

  return changes;
}
