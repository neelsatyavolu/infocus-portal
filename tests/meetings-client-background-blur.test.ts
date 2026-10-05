import { describe, expect, it, vi } from "vitest";
import {
  BLUR_FRAME_BUDGET_MS,
  INITIAL_BLUR_PERF,
  createBlurTransform,
  nextBlurPerf,
  shouldSegmentFrame,
  type BlurEngine,
  type BlurPerfState,
  type FrameIo,
  type PersonMask
} from "@/src/lib/meetings/client/background-blur";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const mask: PersonMask = { data: new Float32Array(4), width: 2, height: 2 };

function fakeEngine(
  options: { failSegmenter?: boolean; frameMs?: number; throwOnSegment?: boolean; holdSegmenter?: boolean } = {}
) {
  let clock = 0;
  let onFrame: ((frame: CanvasImageSource) => void) | null = null;
  const segmenters: Array<{ segment: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];
  const ios: Array<FrameIo & { stop: ReturnType<typeof vi.fn> }> = [];
  const compositor = {
    render: vi.fn((_frame: CanvasImageSource, _mask: PersonMask | null, _blurPx: number) => {
      clock += options.frameMs ?? 5;
    }),
    dispose: vi.fn()
  };
  const downscaled = { small: true } as unknown as CanvasImageSource;
  let releaseSegmenter: () => void = () => undefined;
  const segmenterGate = options.holdSegmenter ? new Promise<void>((resolve) => (releaseSegmenter = resolve)) : Promise.resolve();
  const placeholder = { track: { stop: vi.fn(), kind: "placeholder" } as unknown as MediaStreamTrack, stop: vi.fn() };
  const engine: BlurEngine = {
    createPlaceholder: vi.fn(() => placeholder),
    createSegmenter: vi.fn(async () => {
      await segmenterGate;
      if (options.failSegmenter) throw new Error("no wasm");
      const s = {
        segment: vi.fn(() => {
          if (options.throwOnSegment) throw new Error("gpu lost");
          return mask;
        }),
        close: vi.fn()
      };
      segmenters.push(s);
      return s;
    }),
    createIo: vi.fn(async () => {
      const io = {
        width: 1280,
        height: 720,
        canvas: {} as OffscreenCanvas,
        track: { stop: vi.fn() } as unknown as MediaStreamTrack,
        start: vi.fn((cb: (frame: CanvasImageSource) => void) => {
          onFrame = cb;
        }),
        stop: vi.fn()
      };
      ios.push(io);
      return io;
    }),
    createCompositor: vi.fn(() => compositor),
    createDownscaler: vi.fn(() => () => downscaled),
    now: () => clock
  };
  const frame = {} as CanvasImageSource;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i += 1) onFrame?.(frame);
  };
  return { engine, segmenters, ios, compositor, tick, frame, downscaled, placeholder, releaseSegmenter: () => releaseSegmenter() };
}

const camera = () => ({ stop: vi.fn() }) as unknown as MediaStreamTrack;
const hooks = (overrides: Partial<{ onReduced: () => void; onPartial: () => void; onUnavailable: () => void }> = {}) => ({
  onReduced: vi.fn(),
  onPartial: vi.fn(),
  onUnavailable: vi.fn(),
  ...overrides
});

describe("createBlurTransform", () => {
  it("starts, emits the processed track, and stops everything without touching the camera", async () => {
    const fake = fakeEngine();
    const input = camera();
    const seen: unknown[] = [];
    const sub = createBlurTransform(fake.engine, () => 16, hooks())(input).subscribe((t) => seen.push(t));
    await flush();
    expect(seen).toEqual([fake.placeholder.track, fake.ios[0].track]);
    fake.tick();
    expect(fake.compositor.render).toHaveBeenCalledWith(fake.frame, mask, 16);

    sub.unsubscribe();
    expect(fake.ios[0].stop).toHaveBeenCalled();
    expect(fake.compositor.dispose).toHaveBeenCalled();
    expect(fake.segmenters[0].close).toHaveBeenCalled();
    expect(fake.placeholder.stop).toHaveBeenCalled();
    expect(input.stop).not.toHaveBeenCalled();
  });

  it("never publishes a raw camera frame between blur on and segmenter ready", async () => {
    const fake = fakeEngine({ holdSegmenter: true });
    const input = camera();
    const seen: unknown[] = [];
    createBlurTransform(fake.engine, () => 8, hooks())(input).subscribe((t) => seen.push(t));
    // Synchronously: the black placeholder replaces whatever the sender had.
    expect(seen).toEqual([fake.placeholder.track]);
    await flush();
    // Frames flow before the model is ready: published, but whole-frame blurred (no mask).
    expect(seen).toEqual([fake.placeholder.track, fake.ios[0].track]);
    fake.tick(5);
    expect(fake.compositor.render).toHaveBeenCalledTimes(5);
    expect(fake.compositor.render.mock.calls.every((call) => call[1] === null)).toBe(true);
    // Model ready: the person is composited sharp.
    fake.releaseSegmenter();
    await flush();
    fake.tick();
    expect(fake.compositor.render).toHaveBeenLastCalledWith(fake.frame, mask, 8);
    expect(seen).not.toContain(input);
  });

  it("switching cameras with blur on never publishes the new raw camera either", async () => {
    const fake = fakeEngine({ holdSegmenter: true });
    const transform = createBlurTransform(fake.engine, () => 8, hooks());
    const camB = camera();
    const seen: unknown[] = [];
    transform(camera()).subscribe().unsubscribe();
    transform(camB).subscribe((t) => seen.push(t));
    expect(seen[0]).toBe(fake.placeholder.track);
    await flush();
    expect(seen).not.toContain(camB);
  });

  it("model fails: keeps publishing whole-frame blur, never the camera, and says so", async () => {
    const fake = fakeEngine({ failSegmenter: true });
    const h = hooks();
    const input = camera();
    const seen: unknown[] = [];
    createBlurTransform(fake.engine, () => 8, h)(input).subscribe((t) => seen.push(t));
    await flush();
    expect(seen).toEqual([fake.placeholder.track, fake.ios[0].track]);
    fake.tick(3);
    expect(fake.compositor.render.mock.calls.every((call) => call[1] === null)).toBe(true);
    expect(h.onPartial).toHaveBeenCalledTimes(1);
    expect(h.onUnavailable).not.toHaveBeenCalled();
    expect(seen).not.toContain(input);
  });

  it("processing can't run: stays black (never the camera) and asks to turn the camera off", async () => {
    const fake = fakeEngine();
    fake.engine.createIo = vi.fn(async () => {
      throw new Error("no OffscreenCanvas");
    });
    const h = hooks();
    const input = camera();
    const seen: unknown[] = [];
    createBlurTransform(fake.engine, () => 8, h)(input).subscribe((t) => seen.push(t));
    await flush();
    expect(seen).toEqual([fake.placeholder.track]);
    expect(h.onUnavailable).toHaveBeenCalledTimes(1);
    expect(seen).not.toContain(input);
  });

  it("keeps rendering (blurred, last mask) when segmentation throws", async () => {
    const fake = fakeEngine({ throwOnSegment: true });
    createBlurTransform(fake.engine, () => 8, hooks())(camera()).subscribe();
    await flush();
    fake.tick(3);
    expect(fake.compositor.render).toHaveBeenCalledTimes(3);
    expect(fake.compositor.render).toHaveBeenLastCalledWith(fake.frame, null, 8);
  });

  it("a camera switch builds exactly one new pipeline and releases the old one", async () => {
    const fake = fakeEngine();
    const transform = createBlurTransform(fake.engine, () => 8, hooks());
    const camA = camera();
    const camB = camera();
    const a1 = transform(camA).subscribe();
    const a2 = transform(camA).subscribe();
    await flush();
    a1.unsubscribe();
    a2.unsubscribe();
    const b1 = transform(camB).subscribe();
    const b2 = transform(camB).subscribe();
    await flush();
    expect(fake.segmenters).toHaveLength(2);
    expect(fake.ios).toHaveLength(2);
    expect(fake.segmenters[0].close).toHaveBeenCalledTimes(1);
    expect(fake.ios[0].stop).toHaveBeenCalledTimes(1);
    expect(fake.segmenters[1].close).not.toHaveBeenCalled();
    b1.unsubscribe();
    b2.unsubscribe();
    expect(fake.segmenters[1].close).toHaveBeenCalledTimes(1);
  });

  it("releases everything if unsubscribed while loading", async () => {
    const fake = fakeEngine();
    const seen: unknown[] = [];
    createBlurTransform(fake.engine, () => 8, hooks())(camera()).subscribe((t) => seen.push(t)).unsubscribe();
    await flush();
    expect(seen).toEqual([fake.placeholder.track]);
    expect(fake.segmenters[0].close).toHaveBeenCalledTimes(1);
    expect(fake.placeholder.stop).toHaveBeenCalledTimes(1);
    expect(fake.engine.createCompositor).not.toHaveBeenCalled();
  });

  it("steps down when over budget: every other frame, then low-res segmentation, telling the user once", async () => {
    const fake = fakeEngine({ frameMs: 40 });
    const onReduced = vi.fn();
    createBlurTransform(fake.engine, () => 8, hooks({ onReduced }))(camera()).subscribe();
    await flush();
    fake.tick(30);
    expect(onReduced).toHaveBeenCalledTimes(1);
    const before = fake.segmenters[0].segment.mock.calls.length;
    fake.tick(10);
    expect(fake.segmenters[0].segment.mock.calls.length - before).toBe(5);
    fake.tick(30);
    expect(fake.segmenters[0].segment).toHaveBeenLastCalledWith(fake.downscaled, expect.any(Number));
    expect(onReduced).toHaveBeenCalledTimes(1);
    expect(fake.compositor.render).toHaveBeenCalledTimes(70);
  });
});

describe("nextBlurPerf", () => {
  const feed = (state: BlurPerfState, ms: number, n: number) => {
    let s = state;
    let notifies = 0;
    for (let i = 0; i < n; i += 1) {
      const r = nextBlurPerf(s, ms);
      s = r.state;
      if (r.notify) notifies += 1;
    }
    return { s, notifies };
  };

  it("stays at full quality under budget", () => {
    expect(feed(INITIAL_BLUR_PERF, BLUR_FRAME_BUDGET_MS - 5, 200).s.level).toBe(0);
  });

  it("ignores a single slow frame", () => {
    const warm = feed(INITIAL_BLUR_PERF, 10, 40).s;
    expect(nextBlurPerf(warm, 200).state.level).toBe(0);
  });

  it("steps 0 → 1 → 2 and notifies once", () => {
    const { s, notifies } = feed(INITIAL_BLUR_PERF, 45, 200);
    expect(s.level).toBe(2);
    expect(notifies).toBe(1);
  });

  it("segments every other frame from level 1", () => {
    expect([0, 1, 2, 3].map((i) => shouldSegmentFrame(0, i))).toEqual([true, true, true, true]);
    expect([0, 1, 2, 3].map((i) => shouldSegmentFrame(1, i))).toEqual([true, false, true, false]);
  });
});
