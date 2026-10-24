import type { PlatformRole } from "@prisma/client";
import { resolveOriginalDownloadUrl } from "@/src/lib/media-playback";
import { parseRollTitle, rollKindFolder } from "@/src/lib/package-roll-kind";
import { hasPlatformRole } from "@/src/lib/platform-roles";
import { prisma } from "@/src/lib/prisma";
import { createStoredZipStream, type StoredZipEntry } from "@/src/lib/zip-stream";
import { buildUniqueArchivePath, sanitizeArchivePathSegment } from "@/src/server/project-download";

/**
 * One zip is CRC'd on the Worker (about 300–500 MB/s against a 5-minute CPU budget), so a
 * selection over this size is refused and the student downloads it in parts.
 */
export const A_ROLL_ZIP_MAX_BYTES = 40 * 1024 ** 3;

export class ARollDownloadError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type ClipVersion = {
  id: string;
  status: string;
  bunnyVideoId: string;
  storageProvider: string | null;
  nasPath: string | null;
  storageSizeBytes: bigint | null;
  updatedAt: Date;
};

export type ARollDownloadClip = {
  id: string;
  title: string;
  folder: string;
  version: ClipVersion;
};

export type ARollDownloadPlan = {
  archiveFileName: string;
  clips: ARollDownloadClip[];
};

/** `Package Storage/…/A-roll/interview.MOV` → `interview` + `.MOV`; Bunny clips fall back to the title. */
function clipFileParts(clip: ARollDownloadClip) {
  const fileName = clip.version.nasPath?.split("/").pop() ?? "";
  const match = fileName.match(/^(.+?)(\.[^./]+)?$/);
  if (match?.[1]) {
    return { base: match[1], extension: match[2] ?? ".mp4" };
  }
  return { base: clip.title, extension: ".mp4" };
}

/**
 * The ready A-roll/B-roll clips of one package that the viewer may download: members of the
 * package and producers, the same people who can open its A-roll stage. `ids` empty means all.
 */
export async function getARollDownloadPlan(input: {
  userId: string;
  role: PlatformRole | null;
  rowId: string;
  ids: string[];
}): Promise<ARollDownloadPlan> {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: input.rowId },
    select: {
      cycleNumber: true,
      groupTopic: true,
      members: { select: { userId: true } },
      stageMedia: {
        where: { stage: "a-roll" },
        select: {
          mediaItem: {
            select: {
              id: true,
              title: true,
              currentVersion: {
                select: {
                  id: true,
                  status: true,
                  bunnyVideoId: true,
                  storageProvider: true,
                  nasPath: true,
                  storageSizeBytes: true,
                  updatedAt: true
                }
              }
            }
          }
        }
      }
    }
  });
  if (!row) {
    throw new Error("NOT_FOUND");
  }
  const isMember = row.members.some((member) => member.userId === input.userId);
  if (!isMember && !hasPlatformRole(input.role, "ASSOCIATE_PRODUCER")) {
    throw new Error("FORBIDDEN");
  }

  const wanted = new Set(input.ids);
  const clips: ARollDownloadClip[] = [];
  for (const { mediaItem } of row.stageMedia) {
    if (wanted.size > 0 && !wanted.has(mediaItem.id)) continue;
    const version = mediaItem.currentVersion;
    if (!version || version.status !== "READY") continue;
    const { rollKind, displayTitle } = parseRollTitle(mediaItem.title);
    clips.push({
      id: mediaItem.id,
      title: displayTitle,
      folder: rollKind ? rollKindFolder(rollKind) : "Other",
      version
    });
  }
  if (clips.length === 0) {
    throw new ARollDownloadError(
      wanted.size > 0 ? "Those clips are not ready to download yet." : "There are no clips to download yet.",
      409
    );
  }
  const totalBytes = clips.reduce((sum, clip) => sum + Number(clip.version.storageSizeBytes ?? 0), 0);
  if (clips.length > 1 && totalBytes > A_ROLL_ZIP_MAX_BYTES) {
    throw new ARollDownloadError(
      "That is too much footage for one zip (40 GB max). Select fewer clips and download them in parts.",
      413
    );
  }

  const group = sanitizeArchivePathSegment(row.groupTopic, "Package");
  return {
    archiveFileName: `${group} - Cycle ${row.cycleNumber} footage.zip`,
    clips
  };
}

/** A signed URL that saves the original file (Drive sends it as an attachment with inline=0). */
export async function resolveClipDownloadUrl(clip: ARollDownloadClip): Promise<string> {
  const url = await resolveOriginalDownloadUrl(clip.version);
  if (!url) {
    throw new ARollDownloadError(`"${clip.title}" is not ready to download yet.`, 409);
  }
  if (!clip.version.nasPath) {
    return url;
  }
  const driveUrl = new URL(url);
  driveUrl.searchParams.set("inline", "0");
  return driveUrl.toString();
}

/**
 * Zip of the clips under A-roll/ and B-roll/ (stored, not recompressed). Clips are fetched one at
 * a time as the zip reaches them, so a long download never holds more than one open Drive fetch.
 */
export function createARollZipStream(plan: ARollDownloadPlan, requestId: string) {
  const usedPaths = new Set<string>();

  async function* entries(): AsyncGenerator<StoredZipEntry, void, undefined> {
    for (const clip of plan.clips) {
      const url = await resolveOriginalDownloadUrl(clip.version);
      const upstream = url ? await fetch(url, { cache: "no-store" }) : null;
      if (!upstream?.ok || !upstream.body) {
        console.error(
          `[a-roll-download] id=${requestId} clip-fetch-failed media=${clip.id} status=${upstream?.status ?? "no-url"}`
        );
        throw new ARollDownloadError(`"${clip.title}" could not be downloaded right now.`, 502);
      }
      const { base, extension } = clipFileParts(clip);
      yield {
        name: buildUniqueArchivePath(usedPaths, clip.folder, base, extension),
        lastModified: clip.version.updatedAt,
        stream: upstream.body
      };
    }
  }

  return createStoredZipStream(entries(), {
    onCancel: () => console.info(`[a-roll-download] id=${requestId} cancelled`),
    onError: (error) =>
      console.error(
        `[a-roll-download] id=${requestId} zip-error ${error instanceof Error ? error.message : String(error)}`
      ),
    onComplete: ({ totalBytes, entryCount }) =>
      console.info(`[a-roll-download] id=${requestId} complete entries=${entryCount} bytes=${totalBytes}`)
  });
}
