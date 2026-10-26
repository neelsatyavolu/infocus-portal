/**
 * Whether teleprompter run mode is open in this tab, and when it last closed. The teleprompter
 * marks it (teleprompter-client.tsx); the Halloween extras read it so they stay silent and out of
 * the way while someone is reading on air.
 */

let openCount = 0;
let lastClosedAt = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** Marks run mode open; call the returned function when it closes (fits a useEffect cleanup). */
export function markRunModeOpen(): () => void {
  openCount += 1;
  notify();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    openCount -= 1;
    lastClosedAt = Date.now();
    notify();
  };
}

export function isRunModeOpen(): boolean {
  return openCount > 0;
}

/** Milliseconds since run mode last closed (Infinity if it never opened in this tab). */
export function msSinceRunModeClosed(now = Date.now()): number {
  return lastClosedAt ? now - lastClosedAt : Number.POSITIVE_INFINITY;
}

export function subscribeRunMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
