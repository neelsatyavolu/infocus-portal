"use client";

import { useLayoutEffect, useMemo, useRef } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any callback shape
type Callbacks = Record<string, (...args: any[]) => unknown>;

/**
 * Returns an object with the same callbacks whose identities never change; each one calls the
 * latest version passed in. Lets memoized cards and rows skip re-rendering when the page does.
 * The set of keys must stay the same between renders.
 */
export function useStableCallbacks<T extends Callbacks>(callbacks: T): T {
  const latest = useRef(callbacks);
  useLayoutEffect(() => {
    latest.current = callbacks;
  });

  return useMemo(() => {
    const stable: Callbacks = {};
    for (const key of Object.keys(latest.current)) {
      stable[key] = (...args: unknown[]) => latest.current[key](...args);
    }
    return stable as T;
    // Keys are fixed for the component's life; the wrappers read `latest` when called.
  }, []);
}
