import { driveBaseUrl, driveFetch, nasDeriveWebPlaybackUrl, nasMintDownloadUrl, nasMintUploadSession } from "@/src/lib/nas-storage";
import {
  isShowRecordingPath, MAX_LISTED_FOLDERS, MAX_LISTED_RECORDINGS, recordingsFromListing, SHOW_RECORDINGS_FOLDER,
  type DriveListItem, type ShowRecording
} from "@/src/lib/show-editor";
import { ShowEditError } from "@/src/server/show-editor-errors";

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

/** Recording previews in the picker play for this long. */
const RECORDING_PREVIEW_TTL_SECONDS = 3 * 3600;

/**
 * Whether Drive's browser copy of a recording is ready. A switcher recording has to be converted first, which
 * takes about a minute per few minutes of show: longer than a `<video>` or the tunnel waits for a first byte,
 * so Drive converts it in the background and the picker asks again. A Drive without that endpoint converts
 * while the video waits, as before.
 */
async function browserCopyReady(path: string) {
  const res = await driveFetch(`/api/service/web-proxy?path=${encodeURIComponent(path)}`, { method: "POST" });
  if (res.status === 404 || res.status === 405) return true;
  if (!res.ok) throw new Error(`Drive web proxy failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { ready?: boolean }).ready === true;
}

/**
 * A playable link for one recording the picker lists, minted like the edited show's preview, or `ready: false`
 * while Drive is still converting it. Refused (400) for a path outside `Shows/`, and (404) for one the listing
 * doesn't have.
 */
export async function recordingPreviewUrl(path: string, now = new Date()) {
  if (!isShowRecordingPath(path)) throw new ShowEditError(`Pick a recording from the ${SHOW_RECORDINGS_FOLDER} folder.`, 400);
  if (!(await listShowRecordings(now)).some((recording) => recording.path === path)) {
    throw new ShowEditError(`That recording isn't in the ${SHOW_RECORDINGS_FOLDER} folder on Drive.`, 404);
  }
  if (!(await browserCopyReady(path))) return { ready: false, url: null };
  return { ready: true, url: nasDeriveWebPlaybackUrl(await nasMintDownloadUrl(path, RECORDING_PREVIEW_TTL_SECONDS)) };
}

/** Where the setup app lives on the Drive (uploaded by hand after each setup-app build). */
export const EDITOR_SETUP_APP_PATH = "Package Storage/Editor/InFocus Editor Setup.dmg";

/** A 30-minute download link for the setup app, saved as a file rather than opened. */
export async function setupAppDownloadUrl() {
  const url = new URL(await nasMintDownloadUrl(EDITOR_SETUP_APP_PATH, 30 * 60));
  url.searchParams.set("inline", "false");
  return url.toString();
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
