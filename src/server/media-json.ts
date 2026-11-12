import { buildMediaVersionImageUrl } from "@/src/lib/media-assets";
import { resolveThumbnailUrls } from "@/src/lib/media-playback";

type VersionRow = {
  id: string;
  sourceType: string;
  status: string;
  storageProvider: string | null;
  bunnyVideoId: string;
  nasPath: string | null;
  storageSizeBytes?: bigint | null;
};

type MediaRow<V extends VersionRow> = {
  id: string;
  versions: V[];
  currentVersion?: V | null;
};

const OMITTED_VERSION_FIELDS = new Set(["storageSizeBytes", "imageBase64", "uploadSignature"]);

type JsonVersion<V extends VersionRow> = Omit<V, "storageSizeBytes" | "imageBase64" | "uploadSignature"> & {
  storageSizeBytes: number | null;
  thumbnailUrl: string | null;
};

/**
 * A media version as JSON: `storageSizeBytes` as a number (JSON has no BigInt), the image bytes and
 * upload signature left out, and `thumbnailUrl` the same poster the web tiles show (image route for
 * images, Bunny or Drive poster for ready videos, else null).
 */
function toJsonVersion<V extends VersionRow>(
  mediaId: string,
  version: V,
  posters: Map<string, string | null>
): JsonVersion<V> {
  const rest = Object.fromEntries(
    Object.entries(version).filter(([key]) => !OMITTED_VERSION_FIELDS.has(key))
  ) as Omit<V, "storageSizeBytes" | "imageBase64" | "uploadSignature">;
  const thumbnailUrl =
    version.sourceType === "IMAGE" ? buildMediaVersionImageUrl(mediaId, version.id) : posters.get(version.id) ?? null;
  return {
    ...rest,
    storageSizeBytes: version.storageSizeBytes == null ? null : Number(version.storageSizeBytes),
    thumbnailUrl
  };
}

/**
 * Project media rows (see `PROJECT_MEDIA_ROW_INCLUDE`) with every version made JSON-safe. Posters are
 * minted once per version (currentVersion is also in `versions`) with bounded Drive concurrency.
 */
export async function serializeMediaRows<V extends VersionRow, M extends MediaRow<V>>(rows: readonly M[]) {
  const videos = rows.flatMap((media) =>
    [...media.versions, ...(media.currentVersion ? [media.currentVersion] : [])].filter(
      (version) => version.sourceType !== "IMAGE"
    )
  );
  const posters = await resolveThumbnailUrls(videos);
  return rows.map((media) => ({
    ...media,
    versions: media.versions.map((version) => toJsonVersion(media.id, version, posters)),
    currentVersion: media.currentVersion ? toJsonVersion(media.id, media.currentVersion, posters) : null
  }));
}

/** One project media row made JSON-safe (see `serializeMediaRows`). */
export async function serializeMediaRow<V extends VersionRow, M extends MediaRow<V>>(media: M) {
  const [row] = await serializeMediaRows<V, M>([media]);
  return row;
}
