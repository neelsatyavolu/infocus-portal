import { driveBaseUrl, driveFetch, nasMintUploadSession } from "@/src/lib/nas-storage";
import {
  MAX_LISTED_FOLDERS, MAX_LISTED_RECORDINGS, recordingsFromListing, SHOW_RECORDINGS_FOLDER, type DriveListItem, type ShowRecording
} from "@/src/lib/show-editor";

/** Download and upload links handed to the editing Mac last this long (Drive's cap is 6 hours). */
export const EDITOR_TOKEN_TTL_SECONDS = 6 * 3600;

/** One Drive folder through the service API (read-only; `Shows/` and the package roots). */
export async function driveListing(dir: string): Promise<DriveListItem[]> {
  const res = await driveFetch(`/api/service/list?path=${encodeURIComponent(dir)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive list failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { items?: DriveListItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

/**
 * The recordings in Drive `Shows/` and one level of subfolders (a camera set often lands in a folder),
 * newest first. Only the newest 12 subfolders are opened, and one that can't be read is skipped.
 */
export async function listShowRecordings(now = new Date()): Promise<ShowRecording[]> {
  const top = await driveListing(SHOW_RECORDINGS_FOLDER);
  const folders = top
    .filter((item) => item.isDir && !item.name.startsWith(".") && !item.name.startsWith("#") && !item.name.startsWith("@"))
    .sort((a, b) => b.mtime.localeCompare(a.mtime))
    .slice(0, MAX_LISTED_FOLDERS);
  const nested = await Promise.all(folders.map((folder) =>
    driveListing(folder.path).then((items) => recordingsFromListing(items, now, folder.path)).catch((error) => {
      console.error("show editor: couldn't list a Shows subfolder", error);
      return [] as ShowRecording[];
    })
  ));
  return [...recordingsFromListing(top, now), ...nested.flat()]
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, MAX_LISTED_RECORDINGS);
}

/** Read link for one file, for the editing Mac to download (`inline=false` streams the original). */
export async function mintEditorDownload(path: string) {
  const res = await driveFetch("/api/service/mint-token", {
    method: "POST",
    body: JSON.stringify({ path, purpose: "r", ttlSeconds: EDITOR_TOKEN_TTL_SECONDS })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive mint-token failed for a download: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { downloadUrl: string };
  const url = new URL(data.downloadUrl);
  url.searchParams.set("inline", "false");
  return url.toString();
}

/** Read/write token for one output path (its folder is created first). */
export async function mintEditorUpload(path: string) {
  const session = await nasMintUploadSession(path, EDITOR_TOKEN_TTL_SECONDS);
  return { path: session.path, token: session.token };
}

/** Size of one Drive file from its folder listing, or null when it can't be read. */
export async function driveFileSize(path: string): Promise<number | null> {
  const slash = path.lastIndexOf("/");
  if (slash <= 0) return null;
  try {
    const item = (await driveListing(path.slice(0, slash))).find((entry) => entry.path === path);
    return item && !item.isDir ? item.size : null;
  } catch {
    return null;
  }
}

export function editorDriveBaseUrl() {
  return driveBaseUrl();
}
