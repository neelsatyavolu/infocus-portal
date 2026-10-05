import { Observable } from "rxjs";
import { INITIAL_BLUR_PERF, SEGMENT_MAX_HEIGHT, SEGMENT_MAX_WIDTH, nextBlurPerf, nextSegmentHealth, shouldSegmentFrame, type SegmentHealth } from "./blur-perf";
import { diagEvent } from "./diagnostics";
import type { BackgroundMode } from "./meet-settings";

/**
 * Background blur as a partytracks camera transformation. Segmentation (MediaPipe selfie
 * segmenter) and compositing run on the device. The output never carries an unblurred frame:
 * before the first mask the whole frame is blurred, and on any error the last mask is reused.
 * Dependencies are injected (see blur-engine.ts) so the lifecycle is unit-testable.
 */

export const BLUR_PX: Record<Exclude<BackgroundMode, "off">, number> = { slight: 8, blur: 16 };

/** `version` changes on every new mask (the engine reuses one buffer, so identity can't be used). */
export type PersonMask = { data: Float32Array; width: number; height: number; version: number };

/** A video frame source (VideoFrame, <video>, canvas...). */
export type FrameSource = CanvasImageSource;

export type Segmenter = {
  /** Synchronous (MediaPipe VIDEO mode): the person-confidence mask for this frame, or null. */
  segment: (frame: FrameSource, timestampMs: number) => PersonMask | null;
  close: () => void;
};

export type SegmenterOptions = {
  /** CPU delegate only (after the GPU path failed or lost its WebGL context). */
  cpu: boolean;
  /** The segmenter's WebGL context was lost (GPU delegate): it can't produce masks any more. */
  onContextLost: () => void;
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
  createSegmenter: (options: SegmenterOptions) => Promise<Segmenter>;
  createIo: (input: MediaStreamTrack) => Promise<FrameIo>;
  createCompositor: (io: FrameIo) => Compositor;
  /** Draws a frame at most this size for segmentation (performance guard level 2). */
  createDownscaler: (maxWidth: number, maxHeight: number) => (frame: FrameSource) => FrameSource;
  now: () => number;
};

export {
  BLUR_FRAME_BUDGET_MS,
  INITIAL_BLUR_PERF,
  SEGMENT_MAX_HEIGHT,
  SEGMENT_MAX_WIDTH,
  nextBlurPerf,
  shouldSegmentFrame,
  type BlurPerfState
} from "./blur-perf";

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

type Pipeline = {
  refs: number;
  /** Calls `listener` with the current output track now and whenever it changes. */
  watch: (listener: (track: MediaStreamTrack) => void) => () => void;
  teardown: () => void;
};

/** Rebuild a broken segmenter at most this many times per pipeline (then whole-frame blur). */
const MAX_REBUILDS = 3;

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

  let lastMask: PersonMask | null = null;
  let rebuilds = 0;

  /**
   * (Re)builds the segmenter. Until it's ready, frames are whole-frame blurred. A broken one
   * (failure streak or lost WebGL context) is dropped with its mask and rebuilt on the CPU.
   */
  const loadSegmenter = (cpu: boolean) => {
    void engine
      .createSegmenter({ cpu, onContextLost: () => broken("webgl_context_lost") })
      .then((created) => {
        if (closed) created.close();
        else segmenter = created;
      })
      .catch(() => {
        if (!closed) hooks.onPartial();
      });
  };

  const broken = (reason: string) => {
    if (closed) return;
    diagEvent("blur_segmenter_broken", { reason, rebuilds });
    lastMask = null; // Never keep cutting out a stale silhouette: whole-frame blur until rebuilt.
    segmenter?.close();
    segmenter = null;
    hooks.onPartial();
    if (rebuilds < MAX_REBUILDS) {
      rebuilds += 1;
      loadSegmenter(true);
    }
  };

  loadSegmenter(false);

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
    let health: SegmentHealth = { failures: 0 };
    let frameIndex = 0;
    frameIo.start((frame) => {
      if (closed) return;
      const started = engine.now();
      if (segmenter && shouldSegmentFrame(perf.level, frameIndex)) {
        let mask: PersonMask | null = null;
        try {
          mask = segmenter.segment(perf.level >= 2 ? downscale(frame) : frame, started);
        } catch {
          mask = null;
        }
        // A brief miss reuses the last mask; a long streak means the model is broken.
        if (mask) lastMask = mask;
        const next = nextSegmentHealth(health, mask !== null);
        health = next.state;
        if (next.broken) broken("failure_streak");
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
