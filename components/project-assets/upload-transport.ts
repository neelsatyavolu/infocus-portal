"use client";

/**
 * Sends one file to storage: NAS (multipart to InFocus Drive, then complete-nas-upload) or the
 * legacy Bunny tus endpoint. Progress is throttled to every 200ms, never goes backwards, and
 * carries speed and ETA. Moved verbatim from project-media-tiles.tsx.
 */

const UPLOAD_PROGRESS_REPORT_MS = 200;

export type UploadTarget = {
  provider?: string;
  uploadUrl: string;
  signature: string;
  expiresAt: number;
  videoId: string;
  libraryId: string;
  path?: string;
  token?: string;
};

export type ProgressUpdate = {
  progress: number;
  bytesUploaded: number;
  bytesTotal: number;
  speedBytesPerSecond: number;
  etaSeconds: number | null;
};

export async function uploadFileWithTus(
  file: File,
  upload: UploadTarget,
  title: string,
  onProgress: (update: ProgressUpdate) => void,
  complete?: { mediaId: string; versionId: string }
) {
  const speedTracker = {
    loaded: 0,
    timestampMs: performance.now(),
    speedBytesPerSecond: 0,
    progress: 0,
    bytesUploaded: 0
  };
  let lastReportMs = 0;

  const reportProgress = (bytesUploaded: number, bytesTotal: number) => {
    if (!bytesTotal) return;
    const nowMs = performance.now();
    const elapsedSeconds = (nowMs - speedTracker.timestampMs) / 1000;
    const bytesDelta = bytesUploaded - speedTracker.loaded;
    if (elapsedSeconds > 0 && bytesDelta >= 0) {
      speedTracker.speedBytesPerSecond = bytesDelta / elapsedSeconds;
      speedTracker.loaded = bytesUploaded;
      speedTracker.timestampMs = nowMs;
    }
    const monotonicBytesUploaded = Math.max(speedTracker.bytesUploaded, bytesUploaded);
    speedTracker.bytesUploaded = monotonicBytesUploaded;
    const progress = Math.max(speedTracker.progress, (monotonicBytesUploaded / bytesTotal) * 100);
    speedTracker.progress = progress;
    const bytesRemaining = Math.max(0, bytesTotal - monotonicBytesUploaded);
    const etaSeconds =
      speedTracker.speedBytesPerSecond > 0 ? bytesRemaining / speedTracker.speedBytesPerSecond : null;
    // Progress events can fire many times a second; throttle so the grid doesn't re-render each time.
    if (bytesRemaining > 0 && nowMs - lastReportMs < UPLOAD_PROGRESS_REPORT_MS) {
      return;
    }
    lastReportMs = nowMs;
    onProgress({
      progress,
      bytesUploaded: monotonicBytesUploaded,
      bytesTotal,
      speedBytesPerSecond: speedTracker.speedBytesPerSecond,
      etaSeconds
    });
  };

  // NAS: multipart POST to drive.infocusportal.com (CORS-enabled)
  if ((upload.provider || "").toUpperCase() === "NAS") {
    const { completeNasUpload, uploadFileToNas } = await import("@/src/lib/nas-upload-client");
    await uploadFileToNas(file, upload, reportProgress);
    if (complete) {
      await completeNasUpload(complete.mediaId, complete.versionId);
    }
    onProgress({
      progress: 100,
      bytesUploaded: file.size,
      bytesTotal: file.size,
      speedBytesPerSecond: 0,
      etaSeconds: null
    });
    return;
  }

  // Legacy Bunny path only; NAS uploads never need the tus client.
  const tus = await import("tus-js-client");
  await new Promise<void>((resolve, reject) => {
    const uploader = new tus.Upload(file, {
      endpoint: upload.uploadUrl,
      retryDelays: [0, 1500, 3000, 5000],
      headers: {
        AuthorizationSignature: upload.signature,
        AuthorizationExpire: String(upload.expiresAt),
        VideoId: upload.videoId,
        LibraryId: upload.libraryId
      },
      metadata: {
        filetype: file.type || "video/mp4",
        title
      },
      onError: (error) => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => {
        reportProgress(bytesUploaded, bytesTotal);
      },
      onSuccess: () => {
        onProgress({
          progress: 100,
          bytesUploaded: file.size,
          bytesTotal: file.size,
          speedBytesPerSecond: 0,
          etaSeconds: null
        });
        resolve();
      }
    });

    uploader.start();
  });
}
