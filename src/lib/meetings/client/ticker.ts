/**
 * One shared ~10 Hz tick for level meters and the speaking ring, driven by a dedicated Web
 * Worker timer. Main-thread timers (setInterval, rAF) are throttled to 1 Hz or less in hidden
 * tabs; worker timers and their messages keep going, so auto-lower and the speaking ring work
 * while the tab is in the background. Falls back to setInterval where Workers are unavailable.
 */

export const TICK_MS = 100;

const WORKER_SOURCE = `let t=null;onmessage=(e)=>{clearInterval(t);t=e.data>0?setInterval(()=>postMessage(0),e.data):null}`;

const listeners = new Set<() => void>();
let stopDriver: (() => void) | null = null;

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // One bad listener never stops the others.
    }
  });
}

function startDriver(): () => void {
  if (typeof Worker !== "undefined" && typeof Blob !== "undefined" && typeof URL?.createObjectURL === "function") {
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
      const worker = new Worker(url);
      worker.onmessage = emit;
      worker.postMessage(TICK_MS);
      return () => {
        worker.terminate();
        URL.revokeObjectURL(url);
      };
    } catch {
      // Fall through to a timer.
    }
  }
  const timer = setInterval(emit, TICK_MS);
  return () => clearInterval(timer);
}

/** Calls `listener` every ~100 ms until the returned function is called. */
export function onTick(listener: () => void) {
  listeners.add(listener);
  if (!stopDriver) stopDriver = startDriver();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopDriver) {
      stopDriver();
      stopDriver = null;
    }
  };
}
