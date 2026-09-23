/**
 * Browser-side upload of a file to InFocus Drive.
 * Small files use one multipart POST. Larger files go in retried 16 MiB chunks
 * so Cloudflare Tunnel drops do not kill the whole transfer.
 */

export type NasUploadFields = {
  provider?: "NAS" | "BUNNY" | string;
  uploadUrl: string;
  path?: string;
  token?: string;
  signature?: string;
  expiresAt?: number;
  videoId?: string;
  libraryId?: string;
};

export const NAS_CHUNK_THRESHOLD = 8 * 1024 * 1024;
export const NAS_CHUNK_SIZE = 16 * 1024 * 1024;
const NAS_CHUNK_STREAMS = 3;
const NAS_CHUNK_RETRIES = 3;

export function isNasUpload(upload: NasUploadFields): boolean {
  return (upload.provider || "").toUpperCase() === "NAS";
}

export function nasServiceUrl(uploadUrl: string, leaf: string, query?: Record<string, string>): string {
  const url = new URL(uploadUrl);
  url.pathname = url.pathname.replace(/\/upload\/?$/, `/upload/${leaf}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function nasShouldChunk(fileSize: number): boolean {
  return fileSize >= NAS_CHUNK_THRESHOLD;
}

function xhrErrorMessage(xhr: XMLHttpRequest, fallback: string): string {
  try {
    const body = JSON.parse(xhr.responseText || "{}") as { detail?: string };
    if (typeof body.detail === "string" && body.detail.trim()) {
      return body.detail;
    }
  } catch {
    /* keep */
  }
  if (xhr.status > 0) {
    return `${fallback} (${xhr.status})`;
  }
  return fallback;
}

function sendXhr(
  method: string,
  url: string,
  body: Document | XMLHttpRequestBodyInit | null,
  options: {
    timeoutMs: number;
    headers?: Record<string, string>;
    onProgress?: (loaded: number, total: number) => void;
  }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = false;
    xhr.timeout = options.timeoutMs;
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && options.onProgress) {
        options.onProgress(event.loaded, event.total);
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText || "");
        return;
      }
      reject(new Error(xhrErrorMessage(xhr, "NAS upload failed")));
    });
    xhr.addEventListener("error", () => reject(new Error("Upload dropped (network). Retrying usually works.")));
    xhr.addEventListener("abort", () => reject(new Error("NAS upload aborted")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timed out.")));
    xhr.send(body);
  });
}

async function withRetries<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (attempt >= attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw last instanceof Error ? last : new Error("NAS upload failed.");
}

async function uploadFileSimple(
  file: File,
  upload: NasUploadFields,
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void
): Promise<void> {
  const path = upload.path;
  const token = upload.token;
  const uploadUrl = upload.uploadUrl;
  if (!path || !token || !uploadUrl) {
    throw new Error("NAS upload session incomplete (missing path/token/url)");
  }

  await withRetries(async () => {
    const form = new FormData();
    form.set("path", path);
    form.set("token", token);
    form.set("file", file, file.name);
    await sendXhr("POST", uploadUrl, form, {
      timeoutMs: 60 * 60 * 1000,
      onProgress: (loaded, total) => onProgress?.(loaded, total)
    });
  }, 2);
}

async function uploadFileChunked(
  file: File,
  upload: NasUploadFields,
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void
): Promise<void> {
  if (!upload.path || !upload.token || !upload.uploadUrl) {
    throw new Error("NAS upload session incomplete (missing path/token/url)");
  }
  const path: string = upload.path;
  const fileToken: string = upload.token;
  const uploadUrl: string = upload.uploadUrl;

  const initBody = new FormData();
  initBody.set("path", path);
  initBody.set("token", fileToken);
  initBody.set("name", file.name);
  initBody.set("size", String(file.size));
  initBody.set("chunk_size", String(NAS_CHUNK_SIZE));
  const initText = await sendXhr("POST", nasServiceUrl(uploadUrl, "init"), initBody, {
    timeoutMs: 60 * 1000
  });
  const session = JSON.parse(initText || "{}") as {
    upload_id?: string;
    chunk_size?: number;
    total_chunks?: number;
    received?: number[];
  };
  if (!session.upload_id || !session.total_chunks) {
    throw new Error("NAS could not start a chunked upload.");
  }
  const uploadId = session.upload_id;

  const chunkSize = session.chunk_size || NAS_CHUNK_SIZE;
  const totalChunks = session.total_chunks;
  const received = new Set(session.received ?? []);
  const pieceLoaded = Array.from({ length: totalChunks }, (_, index) => {
    if (!received.has(index)) return 0;
    if (index === totalChunks - 1) return Math.max(0, file.size - chunkSize * (totalChunks - 1));
    return chunkSize;
  });

  const report = () => {
    const loaded = pieceLoaded.reduce((sum, value) => sum + value, 0);
    onProgress?.(Math.min(file.size, loaded), file.size);
  };
  report();

  const pending: number[] = [];
  for (let index = 0; index < totalChunks; index += 1) {
    if (!received.has(index)) pending.push(index);
  }

  let next = 0;
  async function worker() {
    while (next < pending.length) {
      const slot = next;
      next += 1;
      const index = pending[slot];
      const start = index * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const blob = file.slice(start, end);
      await withRetries(async () => {
        pieceLoaded[index] = 0;
        report();
        await sendXhr(
          "PUT",
          nasServiceUrl(uploadUrl, "chunk", {
            upload_id: uploadId,
            index: String(index),
            token: fileToken
          }),
          blob,
          {
            timeoutMs: 30 * 60 * 1000,
            headers: { "Content-Type": "application/octet-stream" },
            onProgress: (loaded) => {
              pieceLoaded[index] = loaded;
              report();
            }
          }
        );
        pieceLoaded[index] = end - start;
        report();
      }, NAS_CHUNK_RETRIES);
    }
  }

  const streams = Math.min(NAS_CHUNK_STREAMS, Math.max(1, pending.length));
  await Promise.all(Array.from({ length: streams }, () => worker()));

  const completeBody = new FormData();
  completeBody.set("upload_id", uploadId);
  completeBody.set("token", fileToken);
  await sendXhr("POST", nasServiceUrl(uploadUrl, "complete"), completeBody, {
    timeoutMs: 10 * 60 * 1000
  });
  onProgress?.(file.size, file.size);
}

export async function uploadFileToNas(
  file: File,
  upload: NasUploadFields,
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void
): Promise<void> {
  if (nasShouldChunk(file.size)) {
    await uploadFileChunked(file, upload, onProgress);
    return;
  }
  await uploadFileSimple(file, upload, onProgress);
}

export async function completeNasUpload(mediaId: string, versionId: string): Promise<void> {
  const res = await fetch(`/api/media/${mediaId}/versions/${versionId}/complete-nas-upload`, {
    method: "POST"
  });
  if (!res.ok) {
    throw new Error(`Failed to finalize NAS upload (${res.status})`);
  }
}
