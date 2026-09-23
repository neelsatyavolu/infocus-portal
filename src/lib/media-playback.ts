import { createPlaybackToken } from "@/src/lib/bunny";
import { thumbnailFromPlaybackUrl } from "@/src/lib/bunny-utils";
import {
  isNasVideoId,
  nasDeriveThumbnailUrl,
  nasDeriveWebPlaybackUrl,
  nasMintDownloadUrl
} from "@/src/lib/nas-storage";

type VersionLike = {
  bunnyVideoId: string;
  storageProvider?: string | null;
  nasPath?: string | null;
  sourceType?: string | null;
  status?: string | null;
};

/**
 * Resolve a playable URL for a media version (Bunny HLS or NAS progressive MP4).
 */
export async function resolvePlaybackUrl(version: VersionLike): Promise<string | null> {
  if (version.sourceType === "IMAGE") {
    return null;
  }

  const provider = (version.storageProvider || "BUNNY").toUpperCase();
  if (provider === "NAS" || isNasVideoId(version.bunnyVideoId)) {
    if (!version.nasPath) {
      return null;
    }
    const downloadUrl = await nasMintDownloadUrl(version.nasPath, 60 * 30);
    return nasDeriveWebPlaybackUrl(downloadUrl);
  }

  return createPlaybackToken(version.bunnyVideoId).playbackUrl;
}

/** Tile/list poster: Bunny thumbnail.jpg or Drive ffmpeg JPEG for NAS videos. */
export async function resolveThumbnailUrl(version: VersionLike): Promise<string | null> {
  if (version.sourceType === "IMAGE") {
    return null;
  }
  if (version.status && version.status !== "READY") {
    return null;
  }

  const provider = (version.storageProvider || "BUNNY").toUpperCase();
  if (provider === "NAS" || isNasVideoId(version.bunnyVideoId)) {
    if (!version.nasPath) return null;
    const downloadUrl = await nasMintDownloadUrl(version.nasPath, 60 * 60 * 6);
    return nasDeriveThumbnailUrl(downloadUrl);
  }

  try {
    const playback = createPlaybackToken(version.bunnyVideoId).playbackUrl;
    return thumbnailFromPlaybackUrl(playback);
  } catch {
    return null;
  }
}

export async function resolveOriginalDownloadUrl(version: VersionLike): Promise<string | null> {
  const provider = (version.storageProvider || "BUNNY").toUpperCase();
  if (provider === "NAS" || isNasVideoId(version.bunnyVideoId)) {
    if (!version.nasPath) return null;
    return nasMintDownloadUrl(version.nasPath, 60 * 15);
  }

  const { createOriginalVideoDownloadToken } = await import("@/src/lib/bunny");
  return createOriginalVideoDownloadToken(version.bunnyVideoId).downloadUrl;
}
