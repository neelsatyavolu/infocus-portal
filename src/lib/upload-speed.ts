export type UploadSpeedSample = {
  speedBytesPerSecond: number;
  etaSeconds: number | null;
};

type SpeedSample = {
  atMs: number;
  loaded: number;
};

const DEFAULT_WINDOW_MS = 2000;
const MIN_ELAPSED_MS = 400;

/**
 * Sliding-window upload rate. Instant bytes/dt between XHR ticks spikes into
 * thousands of MB/s when parallel NAS chunks finish in a few milliseconds.
 */
export function createUploadSpeedTracker(options?: { windowMs?: number; minElapsedMs?: number }) {
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const minElapsedMs = options?.minElapsedMs ?? MIN_ELAPSED_MS;
  let samples: SpeedSample[] = [];
  let lastLoaded = 0;

  function trim(nowMs: number) {
    const cutoff = nowMs - windowMs;
    while (samples.length > 1 && samples[1].atMs <= cutoff) {
      samples.shift();
    }
  }

  return {
    reset(nowMs = 0) {
      samples = [{ atMs: nowMs, loaded: 0 }];
      lastLoaded = 0;
    },
    sample(bytesUploaded: number, bytesTotal: number, nowMs: number): UploadSpeedSample {
      if (bytesUploaded < lastLoaded) {
        samples = [{ atMs: nowMs, loaded: bytesUploaded }];
        lastLoaded = bytesUploaded;
        return { speedBytesPerSecond: 0, etaSeconds: null };
      }

      lastLoaded = bytesUploaded;
      samples.push({ atMs: nowMs, loaded: bytesUploaded });
      trim(nowMs);

      const oldest = samples[0];
      const newest = samples[samples.length - 1];
      const elapsedMs = newest.atMs - oldest.atMs;
      if (elapsedMs < minElapsedMs) {
        return { speedBytesPerSecond: 0, etaSeconds: null };
      }

      const speedBytesPerSecond = Math.max(0, (newest.loaded - oldest.loaded) / (elapsedMs / 1000));
      const remaining = Math.max(0, bytesTotal - bytesUploaded);
      return {
        speedBytesPerSecond,
        etaSeconds: speedBytesPerSecond > 0 ? remaining / speedBytesPerSecond : null
      };
    }
  };
}
