import { describe, expect, it, vi } from "vitest";
import { createBlurTransform, type BlurEngine, type PersonMask } from "@/src/lib/meetings/client/background-blur";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeEngine(options: { failSegmenter?: boolean; segment?: () => Promise<PersonMask | null> } = {}) {
  const frames: Array<() => void> = [];
  const output = { stop: vi.fn() } as unknown as MediaStreamTrack;
  const segmenter = { segment: vi.fn(options.segment ?? (() => Promise.resolve(null))), close: vi.fn() };
  const compositor = { render: vi.fn(), track: output, dispose: vi.fn(() => (output.stop as () => void)()) };
  const video = { srcObject: {} as unknown, videoWidth: 640, videoHeight: 360 } as unknown as HTMLVideoElement;
  const cancel = vi.fn();
  const engine: BlurEngine = {
    createSegmenter: vi.fn(() => (options.failSegmenter ? Promise.reject(new Error("no wasm")) : Promise.resolve(segmenter))),
    createVideo: vi.fn(() => Promise.resolve(video)),
    createCompositor: vi.fn(() => compositor),
    scheduleFrame: vi.fn((_v, cb) => {
      frames.push(cb);
      return cancel;
    }),
    now: () => frames.length * 33
  };
  const nextFrame = () => frames.shift()?.();
  return { engine, segmenter, compositor, output, video, cancel, nextFrame };
}

const camera = () => ({ stop: vi.fn(), getSettings: () => ({ width: 1280, height: 720 }) }) as unknown as MediaStreamTrack;

describe("createBlurTransform", () => {
  it("starts, emits the canvas track at the camera size, and stops cleanly", async () => {
    const fake = fakeEngine();
    const input = camera();
    const seen: unknown[] = [];
    const sub = createBlurTransform(fake.engine, () => 16, vi.fn())(input).subscribe((t) => seen.push(t));
    await flush();
    expect(seen).toEqual([fake.output]);
    expect(fake.engine.createCompositor).toHaveBeenCalledWith(1280, 720);
    expect(fake.compositor.render).toHaveBeenCalledWith(fake.video, null, 16);

    sub.unsubscribe();
    expect(fake.cancel).toHaveBeenCalled();
    expect(fake.output.stop).toHaveBeenCalled();
    expect(fake.segmenter.close).toHaveBeenCalled();
    expect(fake.video.srcObject).toBeNull();
    expect(input.stop).not.toHaveBeenCalled();
  });

  it("passes the original track through and reports when loading fails", async () => {
    const fake = fakeEngine({ failSegmenter: true });
    const onUnavailable = vi.fn();
    const input = camera();
    const seen: unknown[] = [];
    createBlurTransform(fake.engine, () => 8, onUnavailable)(input).subscribe((t) => seen.push(t));
    await flush();
    expect(seen).toEqual([input]);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("skips segmentation while the previous frame is still running, but still renders", async () => {
    let finish: (mask: PersonMask) => void = () => undefined;
    const fake = fakeEngine({ segment: () => new Promise<PersonMask>((resolve) => (finish = resolve)) });
    createBlurTransform(fake.engine, () => 8, vi.fn())(camera()).subscribe();
    await flush();
    fake.nextFrame();
    fake.nextFrame();
    expect(fake.segmenter.segment).toHaveBeenCalledTimes(1);
    expect(fake.compositor.render).toHaveBeenCalledTimes(3);

    const mask = { data: new Float32Array(4), width: 2, height: 2 };
    finish(mask);
    await flush();
    fake.nextFrame();
    expect(fake.segmenter.segment).toHaveBeenCalledTimes(2);
    expect(fake.compositor.render).toHaveBeenLastCalledWith(fake.video, mask, 8);
  });

  it("shares one pipeline per input and tears down after the last subscriber", async () => {
    const fake = fakeEngine();
    const transform = createBlurTransform(fake.engine, () => 8, vi.fn());
    const input = camera();
    const a = transform(input).subscribe();
    const b = transform(input).subscribe();
    await flush();
    expect(fake.engine.createSegmenter).toHaveBeenCalledTimes(1);
    a.unsubscribe();
    expect(fake.segmenter.close).not.toHaveBeenCalled();
    b.unsubscribe();
    expect(fake.segmenter.close).toHaveBeenCalledTimes(1);
  });

  it("releases the segmenter if unsubscribed while loading", async () => {
    const fake = fakeEngine();
    const seen: unknown[] = [];
    createBlurTransform(fake.engine, () => 8, vi.fn())(camera()).subscribe((t) => seen.push(t)).unsubscribe();
    await flush();
    expect(seen).toEqual([]);
    expect(fake.segmenter.close).toHaveBeenCalledTimes(1);
    expect(fake.engine.createCompositor).not.toHaveBeenCalled();
  });
});
