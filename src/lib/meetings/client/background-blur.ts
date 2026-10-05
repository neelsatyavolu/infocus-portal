import { Observable } from "rxjs";
import type { BackgroundMode } from "./meet-settings";

/**
 * Background blur as a partytracks camera transformation. Segmentation (MediaPipe selfie
 * segmenter) and compositing run on the device. The output never carries an unblurred frame:
 * before the first mask the whole frame is blurred, and on any error the last mask is reused.
 * Dependencies are injected (see blur-engine.ts) so the lifecycle is unit-testable.
 */

export const BLUR_PX: Record<Exclude<BackgroundMode, "off">, number> = { slight: 8, blur: 16 };

export type PersonMask = { data: Float32Array; width: number; height: number };

/** A video frame source (VideoFrame, <video>, canvas...). */
export type FrameSource = CanvasImageSource;

export type Segmenter = {
  /** Synchronous (MediaPipe VIDEO mode): the person-confidence mask for this frame, or null. */
  segment: (frame: FrameSource, timestampMs: number) => PersonMask | null;
  close: () => void;
};

export type Compositor = {
  /** Draws a blurred background plus the sharp person into the output (fully blurred without a mask). */
  render: (frame: FrameSource, mask: PersonMask | null, blurPx: number) => void;
  dispose: () => void;
};

/**
 * Frame input/output. `start` calls onFrame once per camera frame and then publishes what the
 * compositor drew. Implementations must keep running in background tabs (no rAF): the insertable
 * streams one is driven by the camera itself, the fallback by a Web Worker timer.
 */
export type FrameIo = {
  width: number;
  height: number;
  /** The compositor draws here; the io publishes it as the next output frame. */
  canvas: HTMLCanvasElement | OffscreenCanvas;
  track: MediaStreamTrack;
  start: (onFrame: (frame: FrameSource) => void) => void;
  /** Stops reading and publishing, and ends the output track. Never stops the input track. */
  stop: () => void;
};

export type BlurEngine = {
  /** A black track at the camera's size, created synchronously (shown while blur starts). */
  createPlaceholder: (input: MediaStreamTrack) => { track: MediaStreamTrack; stop: () => void };
  createSegmenter: () => Promise<Segmenter>;
  createIo: (input: MediaStreamTrack) => Promise<FrameIo>;
  createCompositor: (io: FrameIo) => Compositor;
  /** Draws a frame at most this size for segmentation (performance guard level 2). */
  createDownscaler: (maxWidth: number, maxHeight: number) => (frame: FrameSource) => FrameSource;
  now: () => number;
};

// ---------------------------------------------------------------------------
// Performance guard (pure)
// ---------------------------------------------------------------------------

/** Budget per frame for segmentation + compositing at 30 fps (leaves room for the encoder). */
export const BLUR_FRAME_BUDGET_MS = 28;
const PERF_WINDOW_FRAMES = 30;
export const SEGMENT_MAX_WIDTH = 640;
export const SEGMENT_MAX_HEIGHT = 360;

/** 0 = full, 1 = segment every other frame (reuse the last mask), 2 = also segment at ≤640×360. */
export type BlurPerfState = { level: 0 | 1 | 2; totalMs: number; frames: number; notified: boolean };
export const INITIAL_BLUR_PERF: BlurPerfState = { level: 0, totalMs: 0, frames: 0, notified: false };

/**
 * Feeds one frame's processing time. Every 30 frames, if the window's average is over budget,
 * steps down one level (and measures afresh). A single slow frame never trips it.
 * `notify` is true exactly once, on the first step down.
 */
export function nextBlurPerf(state: BlurPerfState, durationMs: number): { state: BlurPerfState; notify: boolean } {
  const totalMs = state.totalMs + durationMs;
  const frames = state.frames + 1;
  if (frames < PERF_WINDOW_FRAMES) return { state: { ...state, totalMs, frames }, notify: false };
  const overBudget = totalMs / frames > BLUR_FRAME_BUDGET_MS;
  if (!overBudget || state.level === 2) {
    return { state: { ...state, totalMs: 0, frames: 0 }, notify: false };
  }
  const level = (state.level + 1) as 1 | 2;
  return { state: { level, totalMs: 0, frames: 0, notified: true }, notify: !state.notified };
}

export function shouldSegmentFrame(level: BlurPerfState["level"], frameIndex: number) {
  return level === 0 || frameIndex % 2 === 0;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

type Pipeline = {
  refs: number;
  /** Calls `listener` with the current output track now and whenever it changes. */
  watch: (listener: (track: MediaStreamTrack) => void) => () => void;
  teardown: () => void;
};

export type BlurHooks = {
  /** Over budget: quality stepped down (once). */
  onReduced: () => void;
  /** The model failed: the whole frame stays blurred from now on. */
  onPartial: () => void;
  /** Processing can't run at all: the output stays black; the caller turns the camera off. */
  onUnavailable: () => void;
};

type Hooks = BlurHooks & { blurPx: () => number };

/**
 * Output, in order, and never the raw camera while blur is on:
 * 1. a black placeholder, synchronously (so the sender's raw track is replaced at once);
 * 2. the composited track, as soon as frames flow: the whole frame blurred until the segmenter
 *    is ready, then the sharp person over a blurred background;
 * Failures stay private: if the model fails, the whole frame stays blurred (onPartial); if the
 * processing itself can't run, the output stays black (onUnavailable; the caller turns the camera
 * off). The original camera is never published while blur is on.
 */
function buildPipeline(engine: BlurEngine, input: MediaStreamTrack, hooks: Hooks): Pipeline {
  let closed = false;
  let tornDown = false;
  let segmenter: Segmenter | null = null;
  let io: FrameIo | null = null;
  let compositor: Compositor | null = null;
  const placeholder = engine.createPlaceholder(input);
  let current: MediaStreamTrack = placeholder.track;
  const listeners = new Set<(track: MediaStreamTrack) => void>();

  const publish = (track: MediaStreamTrack) => {
    if (closed || current === track) return;
    current = track;
    listeners.forEach((listener) => listener(track));
  };

  const teardown = () => {
    closed = true;
    if (tornDown) return;
    tornDown = true;
    io?.stop(); // Ends the output track; the camera track is partytracks' to stop.
    compositor?.dispose();
    segmenter?.close();
    placeholder.stop();
  };

  // The model loads in parallel; frames are whole-frame blurred until it's ready (or for good).
  void engine
    .createSegmenter()
    .then((created) => {
      if (closed) created.close();
      else segmenter = created;
    })
    .catch(() => {
      if (!closed) hooks.onPartial();
    });

  void (async () => {
    const frameIo = await engine.createIo(input);
    if (closed) {
      frameIo.stop();
      return;
    }
    io = frameIo;
    const comp = engine.createCompositor(frameIo);
    compositor = comp;
    const downscale = engine.createDownscaler(SEGMENT_MAX_WIDTH, SEGMENT_MAX_HEIGHT);

    let perf = INITIAL_BLUR_PERF;
    let frameIndex = 0;
    let lastMask: PersonMask | null = null;
    frameIo.start((frame) => {
      if (closed) return;
      const started = engine.now();
      if (segmenter && shouldSegmentFrame(perf.level, frameIndex)) {
        try {
          const mask = segmenter.segment(perf.level >= 2 ? downscale(frame) : frame, started);
          if (mask) lastMask = mask;
        } catch {
          // Keep the last mask; never show the room unblurred.
        }
      }
      comp.render(frame, lastMask, hooks.blurPx());
      frameIndex += 1;
      if (!segmenter) return; // Measure the real (segmenting) cost only.
      const next = nextBlurPerf(perf, engine.now() - started);
      perf = next.state;
      if (next.notify) hooks.onReduced();
    });
    publish(frameIo.track);
  })().catch(() => {
    if (!closed) hooks.onUnavailable(); // The black placeholder stays; never the raw camera.
  });

  return {
    refs: 0,
    watch: (listener) => {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    teardown
  };
}

/**
 * A stable `(track) => Observable<track>` for camera.addTransform. Subscribers of one input
 * share one pipeline (partytracks runs transforms separately for the broadcast and the local
 * preview). The first emission is a synchronous black placeholder, so turning blur on (or
 * switching cameras with blur on) never publishes a raw camera frame; see buildPipeline.
 */
export function createBlurTransform(engine: BlurEngine, blurPx: () => number, hooks: BlurHooks) {
  const pipelines = new Map<MediaStreamTrack, Pipeline>();
  return (input: MediaStreamTrack) =>
    new Observable<MediaStreamTrack>((subscriber) => {
      let pipeline = pipelines.get(input);
      if (!pipeline) {
        pipeline = buildPipeline(engine, input, { ...hooks, blurPx });
        pipelines.set(input, pipeline);
      }
      const current = pipeline;
      current.refs += 1;
      const unwatch = current.watch((track) => subscriber.next(track));
      return () => {
        unwatch();
        current.refs -= 1;
        if (current.refs > 0) return;
        pipelines.delete(input);
        current.teardown();
      };
    });
}
