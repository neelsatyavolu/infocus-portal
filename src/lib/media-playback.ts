import { createPlaybackToken } from "@/src/lib/bunny";
import { thumbnailFromPlaybackUrl } from "@/src/lib/bunny-utils";
import { mapWithConcurrency } from "@/src/lib/map-with-concurrency";
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
    // A poster is optional: a slow or offline Drive must not fail the whole page render.
    try {
      const downloadUrl = await nasMintDownloadUrl(version.nasPath, 60 * 60 * 6);
      return nasDeriveThumbnailUrl(downloadUrl);
    } catch (error) {
      console.error("[media-playback] NAS thumbnail mint failed", {
        nasPath: version.nasPath,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  try {
    const playback = createPlaybackToken(version.bunnyVideoId).playbackUrl;
    return thumbnailFromPlaybackUrl(playback);
  } catch {
    return null;
  }
}

/** Drive mints per listing page: Workers allow 6 outbound connections at once. */
const THUMBNAIL_MINT_CONCURRENCY = 5;

/**
 * Posters for many versions at once, keyed by version id: each id is resolved once and at most
 * five Drive mints run at a time (a page of 40 media can hold 100+ versions).
 */
export async function resolveThumbnailUrls<V extends VersionLike & { id: string }>(
  versions: readonly V[]
): Promise<Map<string, string | null>> {
  const unique = [...new Map(versions.map((version) => [version.id, version])).values()];
  const urls = await mapWithConcurrency(unique, THUMBNAIL_MINT_CONCURRENCY, (version) => resolveThumbnailUrl(version));
  return new Map(unique.map((version, index) => [version.id, urls[index]]));
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
