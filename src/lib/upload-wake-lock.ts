/** Keep the laptop/phone from sleeping while a long NAS upload is in flight. */
export async function holdUploadWakeLock(): Promise<() => void> {
  if (typeof navigator === "undefined" || !navigator.wakeLock) {
    return () => undefined;
  }

  let lock: WakeLockSentinel | null = null;

  async function acquire() {
    try {
      lock = await navigator.wakeLock.request("screen");
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
    document.removeEventListener("visibilitychange", onVisible);
    void lock?.release().catch(() => undefined);
  };
}
