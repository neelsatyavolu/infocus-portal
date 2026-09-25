const LOAD_TIMEOUT_MS = 2500;
const SEEK_TIMEOUT_MS = 800;
const EXACT_SEEK_TIMEOUT_MS = 8000;

export function canCaptureClientPoster(visibilityState?: string | null) {
  return visibilityState !== "hidden";
}

function waitWithTimeout(signal: (done: (error?: Error) => void) => void, ms: number, message: string) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = window.setTimeout(() => finish(new Error(message)), ms);
    signal(finish);
  });
}

/**
 * Capture a JPEG poster frame from a local video File (browser only).
 * Camera originals often never decode; callers must treat this as optional.
 */
export async function captureVideoThumbnail(
  file: File,
  seekSeconds = 1,
  options: { exact?: boolean; maxWidth?: number } = {}
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await waitWithTimeout(
      (done) => {
        video.addEventListener("loadeddata", () => done(), { once: true });
        video.addEventListener("error", () => done(new Error("Could not load video for thumbnail")), { once: true });
        video.src = objectUrl;
      },
      options.exact ? EXACT_SEEK_TIMEOUT_MS : LOAD_TIMEOUT_MS,
      "Thumbnail capture timed out"
    );

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target = options.exact
      ? (duration > 0 ? Math.min(seekSeconds, Math.max(0, duration - 0.1)) : seekSeconds)
      : duration > 0 ? Math.min(seekSeconds, Math.max(0.1, duration * 0.1)) : seekSeconds;

    if (video.readyState >= 1) {
      await waitWithTimeout(
        (done) => {
          video.addEventListener("seeked", () => done(), { once: true });
          video.currentTime = target;
        },
        options.exact ? EXACT_SEEK_TIMEOUT_MS : SEEK_TIMEOUT_MS,
        "Thumbnail seek timed out"
      );
    }

    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const scale = options.maxWidth ? Math.min(1, options.maxWidth / sourceWidth) : 1;
    const width = Math.round(sourceWidth * scale);
    const height = Math.round(sourceHeight * scale);
    if (!width || !height) {
      throw new Error("No video frame for thumbnail");
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas not available");
    }
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("Failed to encode thumbnail"));
        },
        "image/jpeg",
        0.82
      );
    });

    return blob;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

/** Best-effort: capture + POST poster; never throws (upload already succeeded). */
export async function uploadNasPosterBestEffort(
  file: File,
  mediaId: string,
  versionId: string
): Promise<string | null> {
  if (typeof document !== "undefined" && !canCaptureClientPoster(document.visibilityState)) {
    return null;
  }
  try {
    const blob = await captureVideoThumbnail(file);
    const form = new FormData();
    form.set("file", blob, "poster.jpg");
    const res = await fetch(`/api/media/${mediaId}/versions/${versionId}/poster`, {
      method: "POST",
      body: form
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { thumbnailUrl?: string } };
    return json.data?.thumbnailUrl ?? null;
  } catch {
    return null;
  }
}
