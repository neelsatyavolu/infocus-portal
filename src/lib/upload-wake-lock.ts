/** Keep the laptop/phone from sleeping while a long NAS upload is in flight. */
export async function holdUploadWakeLock(): Promise<() => void> {
  if (typeof navigator === "undefined" || !navigator.wakeLock) {
    return () => undefined;
  }

  let lock: WakeLockSentinel | null = null;
  let released = false;

  async function acquire() {
    try {
      const next = await navigator.wakeLock.request("screen");
      // Released while this request was in flight (a visibility re-acquire): don't keep it.
      if (released) void next.release().catch(() => undefined);
      else lock = next;
    } catch {
      lock = null;
    }
  }

  await acquire();

  function onVisible() {
    if (document.visibilityState === "visible") {
      void acquire();
    }
  }
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    released = true;
    document.removeEventListener("visibilitychange", onVisible);
    void lock?.release().catch(() => undefined);
  };
}
