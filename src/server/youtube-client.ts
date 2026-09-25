import { youtubeWatchUrl } from "@/src/lib/youtube-publication";

const API = "https://www.googleapis.com";
const CHUNK_BYTES = 8 * 1024 * 1024;

export class PublicationError extends Error {
  constructor(message: string, public permanent = false) { super(message); }
}

export function youtubePublishingConfig() {
  const { YOUTUBE_CLIENT_ID: clientId, YOUTUBE_CLIENT_SECRET: clientSecret,
    YOUTUBE_REFRESH_TOKEN: refreshToken, YOUTUBE_CHANNEL_ID: channelId,
    YOUTUBE_PUBLISHING_START_DATE: startDate } = process.env;
  const hour = Number(process.env.YOUTUBE_PUBLISH_HOUR_PACIFIC ?? "0");
  if (!clientId || !clientSecret || !refreshToken || !channelId || !startDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return { clientId, clientSecret, refreshToken, channelId, startDate, hour };
}

// Do not propagate fetch errors: they may contain signed source/session URLs.
async function request(url: string, init?: RequestInit) {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(45_000) });
  } catch {
    throw new PublicationError("YouTube or media transfer interrupted; retry pending.");
  }
}

function uploadUrl(value: string) {
  const url = new URL(value);
  if (url.origin !== API || !url.pathname.startsWith("/upload/youtube/")) {
    throw new PublicationError("Invalid YouTube upload session.", true);
  }
  return value;
}

async function requireOk(response: Response, operation: string) {
  if (response.ok) return;
  await response.body?.cancel();
  throw new PublicationError(`${operation} failed (HTTP ${response.status}).`);
}

export async function youtubeAccessToken() {
  const config = youtubePublishingConfig();
  if (!config) throw new PublicationError("YouTube publishing is not configured.");
  const response = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
      refresh_token: config.refreshToken, grant_type: "refresh_token" })
  });
  await requireOk(response, "YouTube authorization");
  const body = await response.json();
  if (typeof body.access_token !== "string") throw new PublicationError("YouTube authorization returned no token.");
  return body.access_token as string;
}

export async function verifyYoutubeChannel(token: string, channelId: string) {
  const response = await request(`${API}/youtube/v3/channels?part=id&mine=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  await requireOk(response, "YouTube channel verification");
  const data = await response.json();
  if (!data.items?.some((item: { id: string }) => item.id === channelId)) {
    throw new PublicationError("YouTube authorization does not match the configured InFocus channel.", true);
  }
}

export async function sourceVideoSize(sourceUrl: string) {
  const response = await request(sourceUrl, { headers: { Range: "bytes=0-0", "Accept-Encoding": "identity" } });
  const match = /^bytes 0-0\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
  await response.body?.cancel();
  const size = Number(match?.[1]);
  if (response.status !== 206 || !Number.isSafeInteger(size) || size <= 0) {
    throw new PublicationError("Final Cut source must support byte-range downloads.");
  }
  return size;
}

async function startResumableUpload(token: string, size: number, query: string, metadata: unknown) {
  const response = await request(`${API}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status${query}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      "X-Upload-Content-Length": String(size), "X-Upload-Content-Type": "application/octet-stream" },
    body: JSON.stringify(metadata)
  });
  await requireOk(response, "YouTube upload initialization");
  const location = response.headers.get("location");
  if (!location) throw new PublicationError("YouTube returned no upload session.");
  return uploadUrl(location);
}

export async function beginYoutubeUpload(token: string, size: number, title: string, showDate: string) {
  return startResumableUpload(token, size, "&notifySubscribers=false", {
    snippet: { title: title.replace(/[<>]/g, "").slice(0, 100) || "InFocus package",
      description: `InFocus News • ${showDate}`, categoryId: "25" },
    status: { privacyStatus: "unlisted", embeddable: true } });
}

/** Whole-show upload: private until YouTube publishes it at `publishAt`. */
export async function beginYoutubeShowUpload(token: string, size: number,
  input: { title: string; description: string; publishAt: Date }) {
  return startResumableUpload(token, size, "", {
    snippet: { title: input.title.replace(/[<>]/g, "").slice(0, 100) || "InFocus News",
      description: input.description.replace(/[<>]/g, "").slice(0, 5000), categoryId: "25" },
    status: { privacyStatus: "private", publishAt: input.publishAt.toISOString(), embeddable: true } });
}

async function parseProgress(response: Response, size: number): Promise<{ offset: number; videoId?: string }> {
  if (response.status === 308) {
    const range = response.headers.get("range");
    const match = /^bytes=0-(\d+)$/.exec(range ?? "");
    const offset = range ? Number(match?.[1]) + 1 : 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > size) {
      throw new PublicationError("Invalid upload progress from YouTube.", true);
    }
    return { offset };
  }
  if (response.status === 404 || response.status === 410) {
    throw new PublicationError("Upload session expired. Check the channel for an existing video before restarting.", true);
  }
  await requireOk(response, "YouTube upload");
  const video = await response.json();
  if (typeof video.id !== "string" || !/^[\w-]{11}$/.test(video.id)) {
    throw new PublicationError("Upload result is uncertain. Check the channel before restarting.", true);
  }
  return { offset: size, videoId: video.id };
}

export async function readUploadProgress(sessionUrl: string, token: string, size: number) {
  return parseProgress(await request(uploadUrl(sessionUrl), {
    method: "PUT", redirect: "manual",
    headers: { Authorization: `Bearer ${token}`, "Content-Length": "0", "Content-Range": `bytes */${size}` }
  }), size);
}

export async function uploadYoutubeChunk(input: { sourceUrl: string; sessionUrl: string; token: string; size: number; offset: number }) {
  const { sourceUrl, sessionUrl, token, size, offset } = input;
  uploadUrl(sessionUrl);
  const end = Math.min(offset + CHUNK_BYTES, size) - 1;
  const response = await request(sourceUrl, {
    headers: { Range: `bytes=${offset}-${end}`, "Accept-Encoding": "identity" }
  });
  if (response.status !== 206 || response.headers.get("content-range") !== `bytes ${offset}-${end}/${size}`) {
    await response.body?.cancel();
    throw new PublicationError("Final Cut download returned an unexpected byte range.");
  }
  // Bounded even if the source sends more bytes than its Content-Range promises.
  const reader = response.body?.getReader();
  if (!reader) throw new PublicationError("Final Cut download returned no data.");
  const bytes = new Uint8Array(end - offset + 1);
  let received = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (received + next.value.byteLength > bytes.byteLength) throw new Error("Oversized range");
      bytes.set(next.value, received);
      received += next.value.byteLength;
    }
  } catch {
    await reader.cancel().catch(() => {});
    throw new PublicationError("Final Cut chunk download interrupted.");
  }
  if (received !== bytes.byteLength) throw new PublicationError("Final Cut chunk was incomplete.");
  return parseProgress(await request(uploadUrl(sessionUrl), {
    method: "PUT", redirect: "manual",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.byteLength), "Content-Range": `bytes ${offset}-${end}/${size}` },
    body: bytes
  }), size);
}

export async function checkYoutubeVideo(videoId: string, token: string, channelId: string) {
  youtubeWatchUrl(videoId);
  const response = await request(`${API}/youtube/v3/videos?part=snippet,status&id=${videoId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  await requireOk(response, "YouTube processing check");
  const data = await response.json();
  const video = data.items?.[0];
  if (!video) throw new PublicationError("Uploaded video is not available on YouTube.");
  if (video.snippet?.channelId !== channelId) throw new PublicationError("Video channel mismatch.", true);
  if (["failed", "rejected", "deleted"].includes(video.status?.uploadStatus)) {
    throw new PublicationError("YouTube could not process this video. Check YouTube Studio.", true);
  }
  if (video.status?.uploadStatus !== "processed") return false;
  if (video.status?.privacyStatus !== "unlisted" || video.status?.embeddable !== true) {
    throw new PublicationError("Video is not unlisted and embeddable. Check YouTube Studio and the API project audit.", true);
  }
  return true;
}

/** Shows: processed and still scheduled (or already public after its publish time). */
export async function checkScheduledYoutubeVideo(videoId: string, token: string, channelId: string) {
  youtubeWatchUrl(videoId);
  const response = await request(`${API}/youtube/v3/videos?part=snippet,status&id=${videoId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  await requireOk(response, "YouTube processing check");
  const video = (await response.json()).items?.[0];
  if (!video) throw new PublicationError("Uploaded video is not available on YouTube.");
  if (video.snippet?.channelId !== channelId) throw new PublicationError("Video channel mismatch.", true);
  if (["failed", "rejected", "deleted"].includes(video.status?.uploadStatus)) {
    throw new PublicationError("YouTube could not process this video. Check YouTube Studio.", true);
  }
  if (video.status?.uploadStatus !== "processed") return false;
  if (video.status?.privacyStatus !== "public" && !video.status?.publishAt) {
    throw new PublicationError("Video is not scheduled to go public. Check YouTube Studio and the API project audit.", true);
  }
  return true;
}

// Playlists and thumbnails need the broader `youtube` scope; 403 means the refresh token predates it.
async function requireScopedOk(response: Response, operation: string) {
  if (response.status === 403) {
    await response.body?.cancel();
    throw new PublicationError(`${operation} was refused (HTTP 403). Re-authorize the channel with the youtube scope.`, true);
  }
  await requireOk(response, operation);
}

export async function listYoutubePlaylists(token: string) {
  const playlists: Array<{ id: string; title: string }> = [];
  let pageToken = "";
  for (let page = 0; page < 20; page++) {
    const query = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const response = await request(`${API}/youtube/v3/playlists?part=snippet&mine=true&maxResults=50${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    await requireOk(response, "YouTube playlist lookup");
    const data = await response.json();
    for (const item of data.items ?? []) {
      if (typeof item.id === "string" && typeof item.snippet?.title === "string") {
        playlists.push({ id: item.id, title: item.snippet.title });
      }
    }
    if (typeof data.nextPageToken !== "string") break;
    pageToken = data.nextPageToken;
  }
  return playlists;
}

export async function createYoutubePlaylist(token: string, title: string) {
  const response = await request(`${API}/youtube/v3/playlists?part=snippet,status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { title }, status: { privacyStatus: "public" } })
  });
  await requireScopedOk(response, "YouTube playlist creation");
  const body = await response.json();
  if (typeof body.id !== "string") throw new PublicationError("YouTube returned no playlist.");
  return body.id as string;
}

export async function playlistHasVideo(token: string, playlistId: string, videoId: string) {
  const query = `playlistId=${encodeURIComponent(playlistId)}&videoId=${encodeURIComponent(videoId)}`;
  const response = await request(`${API}/youtube/v3/playlistItems?part=id&maxResults=1&${query}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  await requireOk(response, "YouTube playlist check");
  return ((await response.json()).items ?? []).length > 0;
}

export async function addVideoToPlaylist(token: string, playlistId: string, videoId: string) {
  const response = await request(`${API}/youtube/v3/playlistItems?part=snippet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } })
  });
  await requireScopedOk(response, "Adding the video to the playlist");
  await response.body?.cancel();
}

export async function setYoutubeThumbnail(token: string, videoId: string, jpeg: ArrayBuffer) {
  youtubeWatchUrl(videoId);
  const response = await request(`${API}/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
    body: jpeg
  });
  await requireScopedOk(response, "Setting the thumbnail");
  await response.body?.cancel();
}
