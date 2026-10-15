"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A choice remembered for this browser tab only (sessionStorage), for filters that depend on
 * today's date: a new visit starts fresh. The first render uses `initial` (no hydration
 * mismatch); the stored value is applied after mount. Storage errors fall back silently.
 */
export function useSessionChoice<T extends string>(
  key: string,
  initial: T,
  validate: (value: string) => value is T
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored !== null && validate(stored)) setValue(stored);
    } catch {
      // Storage blocked: start from `initial`.
    }
    // Read once per key; `validate` is usually an inline function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const choose = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.sessionStorage.setItem(key, next);
      } catch {
        // Storage blocked or full: the choice lasts for this view only.
      }
    },
    [key]
  );

  return [value, choose];
}
