import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { MediaStatus } from "@prisma/client";

type BunnyConfig = {
  libraryId: string;
  apiKey: string;
  pullZone: string;
  signingKey: string;
  webhookSecret?: string;
};

function getConfig(): BunnyConfig {
  const {
    BUNNY_STREAM_LIBRARY_ID,
    BUNNY_STREAM_API_KEY,
    BUNNY_STREAM_PULL_ZONE,
    BUNNY_STREAM_SIGNING_KEY,
    BUNNY_WEBHOOK_SECRET
  } = process.env;

  if (
    !BUNNY_STREAM_LIBRARY_ID ||
    !BUNNY_STREAM_API_KEY ||
    !BUNNY_STREAM_PULL_ZONE ||
    !BUNNY_STREAM_SIGNING_KEY
  ) {
    throw new Error("Missing Bunny Stream environment configuration");
  }

  return {
    libraryId: BUNNY_STREAM_LIBRARY_ID,
    apiKey: BUNNY_STREAM_API_KEY,
    pullZone: BUNNY_STREAM_PULL_ZONE,
    signingKey: BUNNY_STREAM_SIGNING_KEY,
    webhookSecret: BUNNY_WEBHOOK_SECRET
  };
}

export async function createBunnyVideo(title: string) {
  const config = getConfig();

  const response = await fetch(
    `https://video.bunnycdn.com/library/${config.libraryId}/videos`,
    {
      method: "POST",
      headers: {
        AccessKey: config.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title
      })
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bunny create video failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    guid: string;
    videoLibraryId: number;
  };

  return {
    videoId: data.guid,
    libraryId: String(data.videoLibraryId)
  };
}

export function createUploadAuthorization(videoId: string, expiresInSeconds = 60 * 60 * 3) {
  const config = getConfig();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  // Bunny Stream TUS presigned upload signature format:
  // SHA256(libraryId + apiKey + expirationTime + videoId)
  const signature = createHash("sha256")
    .update(`${config.libraryId}${config.apiKey}${expiresAt}${videoId}`)
    .digest("hex");

  return {
    libraryId: config.libraryId,
    videoId,
    expiresAt,
    signature,
    uploadUrl: "https://video.bunnycdn.com/tusupload"
  };
}

export function createPlaybackToken(videoId: string, expiresInSeconds = 60 * 30) {
  const config = getConfig();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const tokenPath = `/${videoId}`;
  const token = createHmac("sha256", config.signingKey)
    .update(`${tokenPath}${expiresAt}`)
    .digest("hex");

  return {
    token,
    expiresAt,
    playbackUrl: `https://${config.pullZone}.b-cdn.net/${videoId}/playlist.m3u8?token=${token}&expires=${expiresAt}`
  };
}

export function createOriginalVideoDownloadToken(videoId: string, expiresInSeconds = 60 * 5) {
  const config = getConfig();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const tokenPath = `/${videoId}`;
  const token = createHmac("sha256", config.signingKey)
    .update(`${tokenPath}${expiresAt}`)
    .digest("hex");

  return {
    token,
    expiresAt,
    downloadUrl: `https://${config.pullZone}.b-cdn.net/${videoId}/original?token=${token}&expires=${expiresAt}`
  };
}

export type BunnyVideoInfo = {
  guid: string;
  status?: string | number;
  encodeProgress?: number;
  length?: number;
  width?: number;
  height?: number;
  isFinished?: boolean;
  storageSizeBytes?: number;
};

function parseBunnyVideoInfo(payload: Record<string, unknown>): BunnyVideoInfo {
  const status = payload.status ?? payload.Status;
  const encodeProgress = payload.encodeProgress ?? payload.EncodeProgress;
  const length = payload.length ?? payload.Length;
  const width = payload.width ?? payload.Width;
  const height = payload.height ?? payload.Height;
  const isFinished = payload.isFinished ?? payload.IsFinished;
  const storageSizeRaw =
    payload.storageSize ??
    payload.StorageSize ??
    payload.storageSizeBytes ??
    payload.StorageSizeBytes ??
    payload.fileSize ??
    payload.FileSize;
  const guid = payload.guid ?? payload.Guid;
  const storageSizeBytes =
    typeof storageSizeRaw === "number"
      ? storageSizeRaw
      : typeof storageSizeRaw === "string"
        ? Number(storageSizeRaw)
        : undefined;

  return {
    guid: typeof guid === "string" ? guid : "",
    status: typeof status === "string" || typeof status === "number" ? status : undefined,
    encodeProgress: typeof encodeProgress === "number" ? encodeProgress : undefined,
    length: typeof length === "number" ? length : undefined,
    width: typeof width === "number" ? width : undefined,
    height: typeof height === "number" ? height : undefined,
    isFinished: typeof isFinished === "boolean" ? isFinished : undefined,
    storageSizeBytes: typeof storageSizeBytes === "number" && Number.isFinite(storageSizeBytes) ? storageSizeBytes : undefined
  };
}

export function deriveMediaStatusFromBunnyVideo(video: BunnyVideoInfo): MediaStatus {
  const statusValue = `${video.status ?? ""}`.toLowerCase();

  if (statusValue.includes("fail") || statusValue.includes("error")) {
    return MediaStatus.FAILED;
  }

  if (video.isFinished || (typeof video.encodeProgress === "number" && video.encodeProgress >= 100)) {
    return MediaStatus.READY;
  }

  if (statusValue.includes("ready") || statusValue.includes("complete") || statusValue.includes("finished")) {
    return MediaStatus.READY;
  }

  if (typeof video.encodeProgress === "number" && video.encodeProgress > 0) {
    return MediaStatus.PROCESSING;
  }

  return MediaStatus.UPLOADING;
}

export async function getBunnyVideo(videoId: string): Promise<BunnyVideoInfo | null> {
  const config = getConfig();
  const response = await fetch(`https://video.bunnycdn.com/library/${config.libraryId}/videos/${videoId}`, {
    method: "GET",
    headers: {
      AccessKey: config.apiKey
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bunny get video failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return parseBunnyVideoInfo(payload);
}

export async function deleteBunnyVideo(videoId: string) {
  const config = getConfig();
  const response = await fetch(`https://video.bunnycdn.com/library/${config.libraryId}/videos/${videoId}`, {
    method: "DELETE",
    headers: {
      AccessKey: config.apiKey
    }
  });

  if (response.status === 404) {
    return { deleted: false, missing: true };
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bunny delete video failed: ${response.status} ${body}`);
  }

  return { deleted: true, missing: false };
}

export function verifyBunnyWebhookSignature(rawBody: string, headerSignature: string | null) {
  const config = getConfig();

  if (!config.webhookSecret) {
    return true;
  }

  if (!headerSignature) {
    return false;
  }

  const expected = createHmac("sha256", config.webhookSecret).update(rawBody).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(headerSignature));
  } catch {
    return false;
  }
}

export function verifyBunnyWebhookLibrary(payload: Record<string, unknown>) {
  const config = getConfig();
  const libraryId =
    payload.VideoLibraryId ?? payload.videoLibraryId ?? payload.LibraryId ?? payload.libraryId;

  if (libraryId === undefined || libraryId === null) {
    return false;
  }

  return String(libraryId) === config.libraryId;
}

export function verifyBunnyWebhookQuerySecret(url: URL) {
  const config = getConfig();
  const expectedSecret = config.webhookSecret;

  if (!expectedSecret) {
    return true;
  }

  const providedSecret = url.searchParams.get("webhook_key");

  if (!providedSecret) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expectedSecret));
  } catch {
    return false;
  }
}
