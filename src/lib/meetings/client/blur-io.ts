import type { FrameIo, FrameSource } from "./background-blur";

/**
 * Frame input/output for blur that keeps running in background tabs.
 * - Chrome (insertable streams): MediaStreamTrackProcessor pulls each camera VideoFrame and
 *   MediaStreamTrackGenerator publishes the composited frame. Driven by the camera, not timers,
 *   so a hidden tab keeps sending blurred video. Every VideoFrame is closed.
 * - Elsewhere (Safari): a detached <video> drawn on each tick of a dedicated Web Worker timer
 *   (worker timers aren't throttled like rAF/main-thread timers), published with
 *   canvas.captureStream(0) + requestFrame().
 */

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function canvas2d(width: number, height: number): { canvas: AnyCanvas; ctx: AnyCtx } {
  const canvas: AnyCanvas =
    typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d") as AnyCtx | null;
  if (!ctx) throw new Error("Canvas 2D is not available");
  return { canvas, ctx };
}

type ProcessorCtor = new (init: { track: MediaStreamTrack; maxBufferSize?: number }) => { readable: ReadableStream<VideoFrame> };
type GeneratorCtor = new (init: { kind: "video" }) => MediaStreamTrack & { writable: WritableStream<VideoFrame> };

function insertableStreams(): { Processor: ProcessorCtor; Generator: GeneratorCtor } | null {
  const g = globalThis as { MediaStreamTrackProcessor?: ProcessorCtor; MediaStreamTrackGenerator?: GeneratorCtor; VideoFrame?: unknown };
  return g.MediaStreamTrackProcessor && g.MediaStreamTrackGenerator && g.VideoFrame
    ? { Processor: g.MediaStreamTrackProcessor, Generator: g.MediaStreamTrackGenerator }
    : null;
}

function sizeOf(input: MediaStreamTrack) {
  const s = input.getSettings?.() ?? {};
  return { width: s.width || 1280, height: s.height || 720, fps: Math.min(30, s.frameRate || 30) };
}

function insertableIo(input: MediaStreamTrack, api: NonNullable<ReturnType<typeof insertableStreams>>): FrameIo {
  const { width, height } = sizeOf(input);
  // maxBufferSize 1: if a frame takes too long, older camera frames are dropped, never queued.
  const processor = new api.Processor({ track: input, maxBufferSize: 1 });
  const generator = new api.Generator({ kind: "video" });
  const { canvas } = canvas2d(width, height);
  const abort = new AbortController();
  return {
    width,
    height,
    canvas,
    track: generator,
    start: (onFrame) => {
      const transform = new TransformStream<VideoFrame, VideoFrame>({
        transform(frame, controller) {
          try {
            onFrame(frame as unknown as FrameSource);
          } catch {
            // Publish whatever is on the canvas (the last blurred frame); never stall.
          }
          const timestamp = frame.timestamp;
          frame.close();
          controller.enqueue(new VideoFrame(canvas, { timestamp }));
        }
      });
      void processor.readable
        .pipeThrough(transform, { signal: abort.signal })
        .pipeTo(generator.writable, { signal: abort.signal })
        .catch(() => undefined);
    },
    stop: () => {
      abort.abort();
      generator.stop();
    }
  };
}

const TICK_WORKER = `let t=null;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}`;

async function workerTickIo(input: MediaStreamTrack): Promise<FrameIo> {
  const { width, height, fps } = sizeOf(input);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([input]);
  await video.play();
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  // captureStream(0) + requestFrame() publishes exactly one frame per tick. Without requestFrame
  // (very old engines), let the canvas capture at the camera rate instead.
  type CaptureTrack = MediaStreamTrack & { requestFrame?: () => void };
  let track = canvas.captureStream(0).getVideoTracks()[0] as CaptureTrack;
  if (typeof track.requestFrame !== "function") {
    track.stop();
    track = canvas.captureStream(fps).getVideoTracks()[0] as CaptureTrack;
  }
  const url = URL.createObjectURL(new Blob([TICK_WORKER], { type: "text/javascript" }));
  const worker = new Worker(url);
  return {
    width,
    height,
    canvas,
    track,
    start: (onFrame) => {
      worker.onmessage = () => {
        if (video.readyState < 2) return;
        try {
          onFrame(video);
        } catch {
          // Keep publishing the last blurred frame.
        }
        track.requestFrame?.();
      };
      worker.postMessage(Math.round(1000 / fps));
    },
    stop: () => {
      worker.terminate();
      URL.revokeObjectURL(url);
      video.pause();
      video.srcObject = null;
      track.stop();
    }
  };
}

export async function createFrameIo(input: MediaStreamTrack): Promise<FrameIo> {
  const api = insertableStreams();
  return api ? insertableIo(input, api) : workerTickIo(input);
}

/** A black frame track, created synchronously (captureStream of a filled canvas). */
export function createBlackPlaceholder(input: MediaStreamTrack) {
  const { width, height } = sizeOf(input);
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
  }
  const track = canvas.captureStream(5).getVideoTracks()[0];
  return { track, stop: () => track.stop() };
}
