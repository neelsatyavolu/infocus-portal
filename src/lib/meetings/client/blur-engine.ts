import type { BlurEngine, Compositor, FrameIo, FrameSource, PersonMask, Segmenter } from "./background-blur";
import { canvas2d, createBlackPlaceholder, createFrameIo } from "./blur-io";

/**
 * The real blur engine: MediaPipe Tasks Vision, vendored same-origin in public/vendor/mediapipe
 * and imported at runtime only when blur is on (no npm dependency, no CDN).
 */

const BASE = "/vendor/mediapipe";
/** The background is blurred at 1/4 size, then scaled up (cheaper, and smoother). */
const BG_SCALE = 4;

type MpMask = { width: number; height: number; getAsFloat32Array: () => Float32Array };
type MpSegmenter = {
  segmentForVideo: (frame: FrameSource, ts: number, cb: (r: { confidenceMasks?: MpMask[] }) => void) => void;
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
    segment: (frame, timestampMs) => {
      // MediaPipe needs strictly increasing timestamps.
      lastTs = Math.max(lastTs + 1, Math.round(timestampMs));
      let mask: PersonMask | null = null;
      segmenter.segmentForVideo(frame, lastTs, (result) => {
        const m = result.confidenceMasks?.[0];
        // Masks are only valid inside the callback: copy the data out.
        if (m) mask = { data: new Float32Array(m.getAsFloat32Array()), width: m.width, height: m.height };
      });
      return mask;
    },
    close: () => segmenter.close()
  };
}

function createCompositor(io: FrameIo): Compositor {
  const { width, height } = io;
  const outCtx = io.canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!outCtx || !("filter" in outCtx)) throw new Error("Canvas filters are not supported");
  const bg = canvas2d(Math.max(1, Math.round(width / BG_SCALE)), Math.max(1, Math.round(height / BG_SCALE)));
  const person = canvas2d(width, height);
  let maskLayer: ReturnType<typeof canvas2d> | null = null;
  let maskImage: ImageData | null = null;
  let paintedMask: PersonMask | null = null;

  const paintMask = (mask: PersonMask) => {
    if (!maskLayer || maskLayer.canvas.width !== mask.width || maskLayer.canvas.height !== mask.height) {
      maskLayer = canvas2d(mask.width, mask.height);
      maskImage = maskLayer.ctx.createImageData(mask.width, mask.height);
      paintedMask = null;
    }
    // Reused masks (performance guard) don't need repainting.
    if (paintedMask !== mask) {
      const pixels = maskImage!.data;
      for (let i = 0; i < mask.data.length; i += 1) {
        pixels[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, mask.data[i])) * 255);
      }
      maskLayer.ctx.putImageData(maskImage!, 0, 0);
      paintedMask = mask;
    }
    return maskLayer.canvas;
  };

  return {
    render: (frame, mask, blurPx) => {
      bg.ctx.filter = `blur(${blurPx / BG_SCALE}px)`;
      bg.ctx.drawImage(frame, 0, 0, bg.canvas.width, bg.canvas.height);
      outCtx.imageSmoothingEnabled = true;
      outCtx.drawImage(bg.canvas, 0, 0, width, height);
      if (!mask) return; // Until the first mask, the whole frame stays blurred.
      person.ctx.globalCompositeOperation = "copy";
      person.ctx.drawImage(frame, 0, 0, width, height);
      person.ctx.globalCompositeOperation = "destination-in";
      person.ctx.drawImage(paintMask(mask), 0, 0, width, height);
      outCtx.drawImage(person.canvas, 0, 0);
    },
    dispose: () => {
      maskLayer = null;
      maskImage = null;
    }
  };
}

function createDownscaler(maxWidth: number, maxHeight: number) {
  let small: ReturnType<typeof canvas2d> | null = null;
  return (frame: FrameSource) => {
    const w = (frame as { displayWidth?: number; videoWidth?: number; width?: number }).displayWidth
      ?? (frame as HTMLVideoElement).videoWidth ?? (frame as { width?: number }).width ?? maxWidth;
    const h = (frame as { displayHeight?: number; videoHeight?: number; height?: number }).displayHeight
      ?? (frame as HTMLVideoElement).videoHeight ?? (frame as { height?: number }).height ?? maxHeight;
    const scale = Math.min(1, maxWidth / Math.max(1, Number(w)), maxHeight / Math.max(1, Number(h)));
    if (scale >= 1) return frame;
    const tw = Math.round(Number(w) * scale);
    const th = Math.round(Number(h) * scale);
    if (!small || small.canvas.width !== tw || small.canvas.height !== th) small = canvas2d(tw, th);
    small.ctx.drawImage(frame, 0, 0, tw, th);
    return small.canvas as unknown as FrameSource;
  };
}

export const mediapipeBlurEngine: BlurEngine = {
  createPlaceholder: createBlackPlaceholder,
  createSegmenter,
  createIo: createFrameIo,
  createCompositor,
  createDownscaler,
  now: () => performance.now()
};
