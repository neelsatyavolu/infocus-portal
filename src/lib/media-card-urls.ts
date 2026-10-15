import { resolvePlaybackUrl, resolveThumbnailUrl } from "@/src/lib/media-playback";
import {
  isNasVideoId,
  nasDeriveThumbnailUrl,
  nasDeriveWebPlaybackUrl,
  nasMintDownloadUrl
} from "@/src/lib/nas-storage";

type CardVersion = {
  bunnyVideoId: string;
  storageProvider?: string | null;
  nasPath?: string | null;
  status?: string | null;
};

/** The poster's token lifetime (resolveThumbnailUrl); playback alone uses 30 minutes. */
const NAS_CARD_TTL_SECONDS = 60 * 60 * 6;

/**
 * A video card's poster and player URLs. For a NAS video that has a poster (READY), one Drive
 * mint serves both, instead of resolveThumbnailUrl and resolvePlaybackUrl minting one each; the
 * URLs are derived the same way, and the player link shares the poster's 6-hour token. If that
 * mint fails, the poster is skipped (logged) and the player mints on its own, as before.
 */
export async function resolveCardMediaUrls(
  version: CardVersion
): Promise<{ thumbnailUrl: string | null; playbackUrl: string | null }> {
  const provider = (version.storageProvider || "BUNNY").toUpperCase();
  const isNas = provider === "NAS" || isNasVideoId(version.bunnyVideoId);
  const wantsPoster = !version.status || version.status === "READY";
  if (!isNas || !version.nasPath || !wantsPoster) {
    const [thumbnailUrl, playbackUrl] = await Promise.all([
      resolveThumbnailUrl(version),
      resolvePlaybackUrl(version)
    ]);
    return { thumbnailUrl, playbackUrl };
  }

  let downloadUrl: string;
  try {
    downloadUrl = await nasMintDownloadUrl(version.nasPath, NAS_CARD_TTL_SECONDS);
  } catch (error) {
    // A poster is optional: same log as resolveThumbnailUrl, then the player tries on its own.
    console.error("[media-playback] NAS thumbnail mint failed", {
      nasPath: version.nasPath,
      error: error instanceof Error ? error.message : String(error)
    });
    return { thumbnailUrl: null, playbackUrl: await resolvePlaybackUrl(version) };
  }
  return {
    thumbnailUrl: nasDeriveThumbnailUrl(downloadUrl),
    playbackUrl: nasDeriveWebPlaybackUrl(downloadUrl)
  };
}
