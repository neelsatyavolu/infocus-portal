/**
 * InFocus Drive (NAS) storage for package media.
 * Layout (flat file in the cycle folder — no title/v1 wrappers):
 *   Package Cycles / {Project name} / {Folder name} / {filename}.mp4
 *   Package Cycles / {Project name} / {filename}.mp4   (no folder)
 * Version 2+ of the same name becomes {basename}-v2.{ext}
 * Poster sits beside the video: {basename}.poster.jpg
 */

import { createHash, randomBytes } from "node:crypto";
import { sanitizeSegment } from "@/src/lib/project-folders";

const PACKAGES_ROOT = "Package Cycles";
const CYCLE_STORAGE_ROOT = "Package Storage";
const CUSTOM_QUEUE_FOLDER = "Publishing Queue";

export type NasUploadSession = {
  provider: "NAS";
  path: string;
  token: string;
  expiresAt: number;
  uploadUrl: string;
  downloadUrl: string;
  /** Synthetic id stored in bunnyVideoId column for uniqueness */
  videoId: string;
  libraryId: "nas";
  signature: string;
};

function driveBaseUrl(): string {
  const base = (process.env.DRIVE_BASE_URL || "https://drive.infocuspaly.com").replace(/\/$/, "");
  return base;
}

function serviceToken(): string {
  const t = process.env.DRIVE_SERVICE_TOKEN || "";
  if (!t) {
    throw new Error("DRIVE_SERVICE_TOKEN is not configured (packages → drive service auth)");
  }
  return t;
}

export function buildNasMediaPath(input: {
  projectName: string;
  folderName?: string | null;
  mediaTitle: string;
  versionNumber: number;
  fileName: string;
}): string {
  const project = sanitizeSegment(input.projectName, "Project");
  const folder = input.folderName ? sanitizeSegment(input.folderName, "Folder") : null;

  // Prefer original filename; fall back to media title + extension
  const rawName = (input.fileName || "").split(/[/\\]/).pop() || "";
  let base = sanitizeSegment(rawName.replace(/\.[^/.]+$/, ""), "");
  let ext = (rawName.match(/\.([^.]+)$/)?.[1] || "mp4").toLowerCase();
  if (!base) {
    base = sanitizeSegment(input.mediaTitle, "video");
  }
  ext = sanitizeSegment(ext, "mp4").replace(/^\./, "");

  // Avoid overwriting on re-upload of a new version of the same title/file
  const ver = Math.max(1, input.versionNumber);
  const file = ver > 1 ? `${base}-v${ver}.${ext}` : `${base}.${ext}`;

  const parts = [PACKAGES_ROOT, project];
  if (folder) parts.push(folder);
  parts.push(file);
  return parts.join("/");
}

/** Student cycle-stage uploads: Package Storage / Cycle N / {group} / {stage} / file */
export function buildCycleStageNasPath(input: {
  cycleNumber: number;
  groupName: string;
  stageFolder: string;
  mediaTitle: string;
  versionNumber: number;
  fileName: string;
}): string {
  const cycle = sanitizeSegment(`Cycle ${input.cycleNumber}`, "Cycle");
  const group = sanitizeSegment(input.groupName, "Untitled group");
  const folder = sanitizeSegment(input.stageFolder, "Stage");

  const rawName = (input.fileName || "").split(/[/\\]/).pop() || "";
  let base = sanitizeSegment(rawName.replace(/\.[^/.]+$/, ""), "");
  let ext = (rawName.match(/\.([^.]+)$/)?.[1] || "mp4").toLowerCase();
  if (!base) {
    base = sanitizeSegment(input.mediaTitle, "video");
  }
  ext = sanitizeSegment(ext, "mp4").replace(/^\./, "");

  const ver = Math.max(1, input.versionNumber);
  const file = ver > 1 ? `${base}-v${ver}.${ext}` : `${base}.${ext}`;

  return [CYCLE_STORAGE_ROOT, cycle, group, folder, file].join("/");
}

/** Producer custom queue uploads: Package Storage / Publishing Queue / {title} / file */
export function buildPublishingQueueNasPath(input: {
  title: string;
  fileName: string;
  versionNumber?: number;
}): string {
  const title = sanitizeSegment(input.title, "Untitled");
  const rawName = (input.fileName || "").split(/[/\\]/).pop() || "";
  let base = sanitizeSegment(rawName.replace(/\.[^/.]+$/, ""), "");
  let ext = (rawName.match(/\.([^.]+)$/)?.[1] || "mp4").toLowerCase();
  if (!base) {
    base = sanitizeSegment(input.title, "video");
  }
  ext = sanitizeSegment(ext, "mp4").replace(/^\./, "");
  const ver = Math.max(1, input.versionNumber ?? 1);
  const file = ver > 1 ? `${base}-v${ver}.${ext}` : `${base}.${ext}`;
  return [CYCLE_STORAGE_ROOT, CUSTOM_QUEUE_FOLDER, title, file].join("/");
}

export function isNasStorageEnabled(): boolean {
  const mode = (process.env.MEDIA_STORAGE_PROVIDER || "BUNNY").toUpperCase();
  return mode === "NAS" || mode === "DRIVE";
}

export function makeNasVideoId(): string {
  return `nas_${randomBytes(16).toString("hex")}`;
}

async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${serviceToken()}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${driveBaseUrl()}${path}`, { ...init, headers });
}

export async function nasEnsureDir(relPath: string): Promise<void> {
  const parent = relPath.split("/").slice(0, -1).join("/");
  if (!parent) return;
  const res = await driveFetch("/api/service/ensure-dir", {
    method: "POST",
    body: JSON.stringify({ path: parent })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NAS ensure-dir failed: ${res.status} ${text}`);
  }
}

export async function nasMintUploadSession(relPath: string, ttlSeconds = 3 * 3600): Promise<NasUploadSession> {
  await nasEnsureDir(relPath);
  const res = await driveFetch("/api/service/mint-token", {
    method: "POST",
    body: JSON.stringify({ path: relPath, purpose: "rw", ttlSeconds })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NAS mint-token failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    token: string;
    path: string;
    expiresAt: number;
    uploadUrl: string;
    downloadUrl: string;
  };
  const videoId = makeNasVideoId();
  return {
    provider: "NAS",
    path: data.path,
    token: data.token,
    expiresAt: data.expiresAt,
    uploadUrl: data.uploadUrl,
    downloadUrl: data.downloadUrl,
    videoId,
    libraryId: "nas",
    // Not a Bunny signature — client uses provider === "NAS" branch
    signature: createHash("sha256").update(data.token).digest("hex").slice(0, 32)
  };
}

export async function nasMintDownloadUrl(relPath: string, ttlSeconds = 30 * 60): Promise<string> {
  const res = await driveFetch("/api/service/mint-token", {
    method: "POST",
    body: JSON.stringify({ path: relPath, purpose: "r", ttlSeconds })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NAS mint download failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { downloadUrl: string };
  return data.downloadUrl;
}

/** ffmpeg JPEG via Drive /api/service/thumbnail (works for ProRes / XAVC). */
export function nasDeriveThumbnailUrl(downloadUrl: string, size = 512): string {
  const url = new URL(downloadUrl);
  url.pathname = url.pathname.replace(/\/file\/?$/, "/thumbnail");
  url.searchParams.set("size", String(size));
  url.searchParams.delete("web");
  return url.toString();
}

/** Ask Drive to serve an H.264/AAC proxy when the original is not browser-safe. */
export function nasDeriveWebPlaybackUrl(downloadUrl: string): string {
  const url = new URL(downloadUrl);
  url.searchParams.set("web", "1");
  return url.toString();
}

export async function nasDelete(relPath: string): Promise<void> {
  const res = await driveFetch(`/api/service/file?path=${encodeURIComponent(relPath)}`, {
    method: "DELETE"
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`NAS delete failed: ${res.status} ${text}`);
  }
}

export function isNasVideoId(id: string | null | undefined): boolean {
  return Boolean(id && (id.startsWith("nas_") || id.startsWith("nas:")));
}

/** Poster beside the video: Final Cut/clip.mp4 → Final Cut/clip.poster.jpg */
export function nasPosterPath(videoNasPath: string): string {
  const normalized = videoNasPath.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  const file = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const dir = slash >= 0 ? normalized.slice(0, slash) : "";
  const base = file.replace(/\.[^/.]+$/, "") || "video";
  const poster = `${base}.poster.jpg`;
  return dir ? `${dir}/${poster}` : poster;
}

/** Server-side upload of a Blob/Buffer to Drive with the service bearer. */
export async function nasUploadBytes(
  relPath: string,
  data: Blob | Buffer,
  fileName = "poster.jpg",
  contentType = "image/jpeg"
): Promise<void> {
  await nasEnsureDir(relPath);
  const form = new FormData();
  form.set("path", relPath);
  const blob =
    data instanceof Blob
      ? data
      : new Blob([new Uint8Array(data)], { type: contentType });
  form.set("file", blob, fileName);

  const res = await fetch(`${driveBaseUrl()}/api/service/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceToken()}`
    },
    body: form
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NAS upload bytes failed: ${res.status} ${text}`);
  }
}


