import { buildMediaVersionImageUrl } from "@/src/lib/media-assets";
import { resolveThumbnailUrl } from "@/src/lib/media-playback";

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
export async function serializeMediaVersion<V extends VersionRow>(mediaId: string, version: V): Promise<JsonVersion<V>> {
  const rest = Object.fromEntries(
    Object.entries(version).filter(([key]) => !OMITTED_VERSION_FIELDS.has(key))
  ) as Omit<V, "storageSizeBytes" | "imageBase64" | "uploadSignature">;
  const thumbnailUrl =
    version.sourceType === "IMAGE" ? buildMediaVersionImageUrl(mediaId, version.id) : await resolveThumbnailUrl(version);
  return {
    ...rest,
    storageSizeBytes: version.storageSizeBytes == null ? null : Number(version.storageSizeBytes),
    thumbnailUrl
  };
}

/** A project media row (see `PROJECT_MEDIA_ROW_INCLUDE`) with every version made JSON-safe. */
export async function serializeMediaRow<V extends VersionRow, M extends MediaRow<V>>(media: M) {
  const [versions, currentVersion] = await Promise.all([
    Promise.all(media.versions.map((version) => serializeMediaVersion(media.id, version))),
    media.currentVersion ? serializeMediaVersion(media.id, media.currentVersion) : Promise.resolve(null)
  ]);
  return { ...media, versions, currentVersion };
}
