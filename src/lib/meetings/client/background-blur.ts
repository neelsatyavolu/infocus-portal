import { Observable } from "rxjs";
import type { BackgroundMode } from "./meet-settings";

/**
 * Background blur as a partytracks camera transformation. Segmentation (MediaPipe selfie
 * segmenter) and compositing run on the device; the output is a canvas track at the camera's
 * size. The audio/video never leaves the device for this, so E2EE is unaffected.
 * Dependencies are injected (see blur-engine.ts) so the lifecycle is unit-testable.
 */

export const BLUR_PX: Record<Exclude<BackgroundMode, "off">, number> = { slight: 8, blur: 16 };

export type PersonMask = { data: Float32Array; width: number; height: number };

export type Segmenter = {
  /** Resolves with the person-confidence mask for this frame (null when there isn't one). */
  segment: (video: HTMLVideoElement, timestampMs: number) => Promise<PersonMask | null>;
  close: () => void;
};

export type Compositor = {
  /** Blurred background plus the sharp person (or a fully blurred frame before the first mask). */
  render: (video: HTMLVideoElement, mask: PersonMask | null, blurPx: number) => void;
  track: MediaStreamTrack;
  dispose: () => void;
};

export type BlurEngine = {
  createSegmenter: () => Promise<Segmenter>;
  /** A playing, muted, detached <video> for the input track. */
  createVideo: (track: MediaStreamTrack) => Promise<HTMLVideoElement>;
  createCompositor: (width: number, height: number) => Compositor;
  /** Calls `callback` on the next video frame; returns a cancel function. */
  scheduleFrame: (video: HTMLVideoElement, callback: () => void) => () => void;
  now: () => number;
};

type Pipeline = { refs: number; output: Promise<MediaStreamTrack>; teardown: () => void };

function buildPipeline(engine: BlurEngine, input: MediaStreamTrack, blurPx: () => number): Pipeline {
  let closed = false;
  let segmenter: Segmenter | null = null;
  let video: HTMLVideoElement | null = null;
  let compositor: Compositor | null = null;
  let cancelFrame: (() => void) | null = null;
  let busy = false;
  let lastMask: PersonMask | null = null;

  const frame = () => {
    if (closed || !video || !compositor || !segmenter) return;
    // Skip segmentation while the previous frame's is still running; reuse the last mask.
    if (!busy) {
      busy = true;
      segmenter
        .segment(video, engine.now())
        .then((mask) => {
          if (mask) lastMask = mask;
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }
    compositor.render(video, lastMask, blurPx());
    cancelFrame = engine.scheduleFrame(video, frame);
  };

  let tornDown = false;
  const teardown = () => {
    closed = true;
    if (tornDown) return;
    tornDown = true;
    cancelFrame?.();
    compositor?.dispose(); // Stops the canvas track; never the camera track.
    segmenter?.close();
    if (video) video.srcObject = null;
  };

  const output = (async () => {
    const created = await engine.createSegmenter();
    if (closed) {
      created.close();
      throw new Error("closed");
    }
    segmenter = created;
    video = await engine.createVideo(input);
    if (closed) throw new Error("closed");
    const settings = input.getSettings?.() ?? {};
    const width = settings.width || video.videoWidth || 1280;
    const height = settings.height || video.videoHeight || 720;
    compositor = engine.createCompositor(width, height);
    frame();
    return compositor.track;
  })();
  // Failed or closed while starting: release whatever was created (teardown is idempotent).
  output.catch(() => teardown());
  return { refs: 0, output, teardown };
}

/**
 * A stable `(track) => Observable<track>` for camera.addTransform. Subscribers of one input
 * share one pipeline (partytracks runs transforms separately for the broadcast and the local
 * preview). On failure the original track passes through and `onUnavailable` is called.
 */
export function createBlurTransform(engine: BlurEngine, blurPx: () => number, onUnavailable: () => void) {
  const pipelines = new Map<MediaStreamTrack, Pipeline>();
  return (input: MediaStreamTrack) =>
    new Observable<MediaStreamTrack>((subscriber) => {
      let pipeline = pipelines.get(input);
      if (!pipeline) {
        pipeline = buildPipeline(engine, input, blurPx);
        pipelines.set(input, pipeline);
      }
      const current = pipeline;
      current.refs += 1;
      let active = true;
      current.output.then(
        (track) => {
          if (active) subscriber.next(track);
        },
        () => {
          if (!active) return;
          onUnavailable();
          subscriber.next(input);
        }
      );
      return () => {
        active = false;
        current.refs -= 1;
        if (current.refs > 0) return;
        pipelines.delete(input);
        current.teardown();
      };
    });
}
