"use client";

import { useLayoutEffect, useRef, useState } from "react";

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

  // Keys are fixed for the component's life; the wrappers read `latest` when called.
  const [stable] = useState(() => {
    const wrappers: Callbacks = {};
    for (const key of Object.keys(callbacks)) {
      wrappers[key] = (...args: unknown[]) => latest.current[key](...args);
    }
    return wrappers as T;
  });
  return stable;
}
