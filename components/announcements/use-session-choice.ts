"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

function subscribeNever() {
  return () => undefined;
}

function readStored<T extends string>(key: string, validate: (value: string) => value is T): T | null {
  try {
    const stored = window.sessionStorage.getItem(key);
    return stored !== null && validate(stored) ? stored : null;
  } catch {
    // Storage blocked: keep the current value.
    return null;
  }
}

/**
 * A choice remembered for this browser tab only (sessionStorage), for filters that depend on
 * today's date: a new visit starts fresh. The first render uses `initial` (no hydration
 * mismatch); the stored value is applied once hydrated. Storage errors fall back silently.
 */
export function useSessionChoice<T extends string>(
  key: string,
  initial: T,
  validate: (value: string) => value is T
): [T, (next: T) => void] {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  // `readKey`: the key whose stored value has been applied (read once per key).
  const [state, setState] = useState<{ value: T; readKey: string | null }>({ value: initial, readKey: null });

  if (hydrated && state.readKey !== key) {
    setState({ value: readStored(key, validate) ?? state.value, readKey: key });
  }

  const choose = useCallback(
    (next: T) => {
      setState((previous) => ({ ...previous, value: next }));
      try {
        window.sessionStorage.setItem(key, next);
      } catch {
        // Storage blocked or full: the choice lasts for this view only.
      }
    },
    [key]
  );

  return [state.value, choose];
}
