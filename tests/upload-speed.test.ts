import { describe, expect, it } from "vitest";
import { createUploadSpeedTracker } from "@/src/lib/upload-speed";

const MB = 1024 * 1024;

describe("createUploadSpeedTracker", () => {
  it("does not treat a 16 MiB chunk finishing in a few ms as thousands of MB/s", () => {
    const tracker = createUploadSpeedTracker();
    tracker.reset(0);

    const spike = tracker.sample(16 * MB, 200 * MB, 5);
    expect(spike.speedBytesPerSecond).toBe(0);
    expect(spike.etaSeconds).toBeNull();
  });

  it("reports a stable rate after a couple seconds of steady progress", () => {
    const tracker = createUploadSpeedTracker();
    tracker.reset(0);

    let loaded = 0;
    let last = { speedBytesPerSecond: 0, etaSeconds: null as number | null };
    for (let t = 100; t <= 3000; t += 100) {
      loaded += MB;
      last = tracker.sample(loaded, 100 * MB, t);
    }

    const mbps = last.speedBytesPerSecond / MB;
    expect(mbps).toBeGreaterThan(8);
    expect(mbps).toBeLessThan(12);
    expect(last.etaSeconds).not.toBeNull();
    expect(last.etaSeconds ?? 0).toBeGreaterThan(6);
    expect(last.etaSeconds ?? 0).toBeLessThan(10);
  });

  it("absorbs a later burst instead of jumping into the thousands", () => {
    const tracker = createUploadSpeedTracker();
    tracker.reset(0);

    let loaded = 0;
    for (let t = 100; t <= 2000; t += 100) {
      loaded += MB;
      tracker.sample(loaded, 400 * MB, t);
    }

    const afterBurst = tracker.sample(loaded + 16 * MB, 400 * MB, 2002);
    expect(afterBurst.speedBytesPerSecond / MB).toBeLessThan(20);
  });

  it("resets cleanly when loaded bytes drop on a chunk retry", () => {
    const tracker = createUploadSpeedTracker();
    tracker.reset(0);
    tracker.sample(8 * MB, 64 * MB, 1000);

    const afterRetry = tracker.sample(0, 64 * MB, 1100);
    expect(afterRetry.speedBytesPerSecond).toBe(0);

    const recovered = tracker.sample(10 * MB, 64 * MB, 3100);
    expect(recovered.speedBytesPerSecond / MB).toBeGreaterThan(4);
    expect(recovered.speedBytesPerSecond / MB).toBeLessThan(6);
  });
});
