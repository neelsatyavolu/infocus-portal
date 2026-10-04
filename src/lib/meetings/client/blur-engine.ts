import type { BlurEngine, Compositor, PersonMask, Segmenter } from "./background-blur";

/**
 * The real blur engine: MediaPipe Tasks Vision, vendored same-origin in public/vendor/mediapipe
 * and imported at runtime only when blur is on (no npm dependency, no CDN).
 */

const BASE = "/vendor/mediapipe";
const FPS = 30;
/** The background is blurred at 1/4 size, then scaled up (cheaper, and smoother). */
const BG_SCALE = 4;

type MpMask = { width: number; height: number; getAsFloat32Array: () => Float32Array };
type MpSegmenter = {
  segmentForVideo: (video: HTMLVideoElement, ts: number, cb: (r: { confidenceMasks?: MpMask[] }) => void) => void;
  close: () => void;
};
type VisionModule = {
  FilesetResolver: { forVisionTasks: (basePath: string) => Promise<unknown> };
  ImageSegmenter: { createFromOptions: (fileset: unknown, options: Record<string, unknown>) => Promise<MpSegmenter> };
};

let visionPromise: Promise<VisionModule> | null = null;

function loadVision() {
  if (!visionPromise) {
    visionPromise = import(/* webpackIgnore: true */ `${BASE}/vision_bundle.mjs`) as Promise<VisionModule>;
    visionPromise.catch(() => {
      visionPromise = null;
    });
  }
  return visionPromise;
}

async function createSegmenter(): Promise<Segmenter> {
  const vision = await loadVision();
  const fileset = await vision.FilesetResolver.forVisionTasks(`${BASE}/wasm`);
  const create = (delegate: "GPU" | "CPU") =>
    vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}/selfie_segmenter.tflite`, delegate },
      runningMode: "VIDEO",
      outputConfidenceMasks: true,
      outputCategoryMask: false
    });
  const segmenter = await create("GPU").catch(() => create("CPU"));
  let lastTs = 0;
  return {
    segment: (video, timestampMs) => {
      // MediaPipe needs strictly increasing timestamps.
      lastTs = Math.max(lastTs + 1, Math.round(timestampMs));
      let mask: PersonMask | null = null;
      segmenter.segmentForVideo(video, lastTs, (result) => {
        const m = result.confidenceMasks?.[0];
        // Masks are only valid inside the callback: copy the data out.
        if (m) mask = { data: new Float32Array(m.getAsFloat32Array()), width: m.width, height: m.height };
      });
      return Promise.resolve(mask);
    },
    close: () => segmenter.close()
  };
}

async function createVideo(track: MediaStreamTrack) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  await video.play();
  return video;
}

function canvas2d(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  return { canvas, ctx };
}

function createCompositor(width: number, height: number): Compositor {
  const out = canvas2d(width, height);
  if (!("filter" in out.ctx)) throw new Error("Canvas filters are not supported");
  const bg = canvas2d(Math.max(1, Math.round(width / BG_SCALE)), Math.max(1, Math.round(height / BG_SCALE)));
  const person = canvas2d(width, height);
  let maskLayer: ReturnType<typeof canvas2d> | null = null;
  let maskImage: ImageData | null = null;
  const track = out.canvas.captureStream(FPS).getVideoTracks()[0];

  const paintMask = (mask: PersonMask) => {
    if (!maskLayer || maskLayer.canvas.width !== mask.width || maskLayer.canvas.height !== mask.height) {
      maskLayer = canvas2d(mask.width, mask.height);
      maskImage = maskLayer.ctx.createImageData(mask.width, mask.height);
    }
    const pixels = maskImage!.data;
    for (let i = 0; i < mask.data.length; i += 1) {
      pixels[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, mask.data[i])) * 255);
    }
    maskLayer.ctx.putImageData(maskImage!, 0, 0);
    return maskLayer.canvas;
  };

  return {
    track,
    render: (video, mask, blurPx) => {
      bg.ctx.filter = `blur(${blurPx / BG_SCALE}px)`;
      bg.ctx.drawImage(video, 0, 0, bg.canvas.width, bg.canvas.height);
      out.ctx.imageSmoothingEnabled = true;
      out.ctx.drawImage(bg.canvas, 0, 0, width, height);
      if (!mask) return; // Until the first mask, the whole frame stays blurred.
      person.ctx.globalCompositeOperation = "copy";
      person.ctx.drawImage(video, 0, 0, width, height);
      person.ctx.globalCompositeOperation = "destination-in";
      person.ctx.drawImage(paintMask(mask), 0, 0, width, height);
      out.ctx.drawImage(person.canvas, 0, 0);
    },
    dispose: () => track.stop()
  };
}

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

function scheduleFrame(video: HTMLVideoElement, callback: () => void) {
  const v = video as FrameVideo;
  if (v.requestVideoFrameCallback && v.cancelVideoFrameCallback) {
    const id = v.requestVideoFrameCallback(callback);
    return () => v.cancelVideoFrameCallback?.(id);
  }
  const id = requestAnimationFrame(callback);
  return () => cancelAnimationFrame(id);
}

export const mediapipeBlurEngine: BlurEngine = {
  createSegmenter,
  createVideo,
  createCompositor,
  scheduleFrame,
  now: () => performance.now()
};
