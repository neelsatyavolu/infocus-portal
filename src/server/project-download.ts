import { MediaStatus, MediaSourceType } from "@prisma/client";
import { createOriginalVideoDownloadToken } from "@/src/lib/bunny";
import { prisma } from "@/src/lib/prisma";
import { createStoredZipStream, type StoredZipEntry } from "@/src/lib/zip-stream";

const ARCHIVE_SEGMENT_MAX_LENGTH = 120;
const LOG_PREFIX = "[project-download]";

function logEvent(requestId: string, event: string, data?: Record<string, unknown>) {
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  console.info(`${LOG_PREFIX} id=${requestId} ${event}${payload}`);
}

function logError(
  requestId: string,
  event: string,
  error: unknown,
  data?: Record<string, unknown>
) {
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `${LOG_PREFIX} id=${requestId} ${event} error=${JSON.stringify(message)}${payload}`
  );
}

class ProjectDownloadError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type DownloadableProjectMedia = {
  id: string;
  title: string;
  updatedAt: Date;
  folder: {
    name: string;
  } | null;
  currentVersion: {
    id: string;
    sourceType: MediaSourceType;
    status: MediaStatus;
    bunnyVideoId: string;
    imageBase64: string | null;
    imageMimeType: string | null;
    updatedAt: Date;
    storageSizeBytes: bigint | null;
  } | null;
};

export type ProjectDownloadManifestEntry =
  | {
      kind: "video";
      archivePath: string;
      lastModified: string;
      sizeBytes: number | null;
      signedUrl: string;
    }
  | {
      kind: "image";
      archivePath: string;
      lastModified: string;
      sizeBytes: number;
      imageBase64: string;
      imageMimeType: string | null;
    };

export type ProjectDownloadManifest = {
  archiveFileName: string;
  entries: ProjectDownloadManifestEntry[];
};

type ProjectDownloadPlan = {
  archiveFileName: string;
  items: DownloadableProjectMedia[];
};

function createBufferStream(buffer: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    }
  });
}

export function sanitizeArchivePathSegment(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, ARCHIVE_SEGMENT_MAX_LENGTH)
    .trim();

  return sanitized.length > 0 ? sanitized : fallback;
}

function extensionFromVideoContentType(contentType: string | null) {
  if (!contentType) {
    return ".mp4";
  }

  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (normalized === "video/quicktime") return ".mov";
  if (normalized === "video/webm") return ".webm";
  if (normalized === "video/x-matroska") return ".mkv";
  return ".mp4";
}

function extensionFromImageMimeType(contentType: string | null) {
  if (!contentType) {
    return ".jpg";
  }

  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/gif") return ".gif";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/heic") return ".heic";
  if (normalized === "image/heif") return ".heif";
  if (normalized === "image/svg+xml") return ".svg";
  return ".jpg";
}

function buildArchiveFileName(projectName: string) {
  return `${sanitizeArchivePathSegment(projectName, "Project")}.zip`;
}

export function buildUniqueArchivePath(
  usedPaths: Set<string>,
  folderName: string | null,
  title: string,
  extension: string
) {
  const folderSegment = folderName ? sanitizeArchivePathSegment(folderName, "Folder") : null;
  const baseName = sanitizeArchivePathSegment(title, "Untitled media");

  let attempt = 1;

  while (true) {
    const suffix = attempt === 1 ? "" : ` (${attempt})`;
    const fileName = `${baseName}${suffix}${extension}`;
    const archivePath = folderSegment ? `${folderSegment}/${fileName}` : fileName;

    if (!usedPaths.has(archivePath)) {
      usedPaths.add(archivePath);
      return archivePath;
    }

    attempt += 1;
  }
}

function summarizeUnavailableItems(items: DownloadableProjectMedia[]) {
  const labels = items.slice(0, 3).map((item) => `"${item.title}"`);
  const suffix = items.length > 3 ? ` and ${items.length - 3} more` : "";
  return `${labels.join(", ")}${suffix}`;
}

function validateProjectMediaForDownload(items: DownloadableProjectMedia[]) {
  if (items.length === 0) {
    throw new ProjectDownloadError("This project does not have any active media to download yet.", 409);
  }

  const unavailable = items.filter((item) => {
    if (!item.currentVersion) {
      return true;
    }

    if (item.currentVersion.sourceType === "VIDEO") {
      return item.currentVersion.status !== MediaStatus.READY;
    }

    if (item.currentVersion.sourceType === "IMAGE") {
      return !item.currentVersion.imageBase64;
    }

    return true;
  });

  if (unavailable.length > 0) {
    throw new ProjectDownloadError(
      `Project download is unavailable until all current media finish processing. Waiting on ${summarizeUnavailableItems(unavailable)}.`,
      409
    );
  }
}

export async function getProjectDownloadPlan(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true
    }
  });

  if (!project) {
    throw new Error("NOT_FOUND");
  }

  const items = await prisma.mediaItem.findMany({
    where: {
      projectId,
      deletedAt: null
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      folder: {
        select: {
          name: true
        }
      },
      currentVersion: {
        select: {
          id: true,
          sourceType: true,
          status: true,
          bunnyVideoId: true,
          imageBase64: true,
          imageMimeType: true,
          updatedAt: true,
          storageSizeBytes: true
        }
      }
    },
    orderBy: [{ createdAt: "asc" }]
  });

  validateProjectMediaForDownload(items);

  return {
    archiveFileName: buildArchiveFileName(project.name),
    items
  } satisfies ProjectDownloadPlan;
}

// Bunny signed-URL TTL for the manifest path. Browser clients can take a
// while to actually finish downloading large projects, so we give the URLs a
// generous window beyond the default 5 min used for single-media playback.
const MANIFEST_SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;

export async function getProjectDownloadManifest(
  projectId: string
): Promise<ProjectDownloadManifest> {
  const plan = await getProjectDownloadPlan(projectId);
  const usedPaths = new Set<string>();
  const entries: ProjectDownloadManifestEntry[] = [];

  for (const item of plan.items) {
    if (!item.currentVersion) {
      continue;
    }

    const folderName = item.folder?.name ?? null;
    const lastModified = (item.currentVersion.updatedAt ?? item.updatedAt).toISOString();

    if (item.currentVersion.sourceType === "IMAGE") {
      if (!item.currentVersion.imageBase64) {
        throw new ProjectDownloadError(`"${item.title}" is not ready to download yet.`, 409);
      }

      const archivePath = buildUniqueArchivePath(
        usedPaths,
        folderName,
        item.title,
        extensionFromImageMimeType(item.currentVersion.imageMimeType)
      );

      // Image bytes are inlined as base64; the client decodes them locally.
      const imageBase64 = item.currentVersion.imageBase64;
      entries.push({
        kind: "image",
        archivePath,
        lastModified,
        sizeBytes: Buffer.byteLength(imageBase64, "base64"),
        imageBase64,
        imageMimeType: item.currentVersion.imageMimeType
      });
      continue;
    }

    if (item.currentVersion.sourceType === "VIDEO") {
      const archivePath = buildUniqueArchivePath(
        usedPaths,
        folderName,
        item.title,
        ".mp4"
      );
      const { downloadUrl } = createOriginalVideoDownloadToken(
        item.currentVersion.bunnyVideoId,
        MANIFEST_SIGNED_URL_TTL_SECONDS
      );

      entries.push({
        kind: "video",
        archivePath,
        lastModified,
        sizeBytes:
          item.currentVersion.storageSizeBytes !== null
            ? Number(item.currentVersion.storageSizeBytes)
            : null,
        signedUrl: downloadUrl
      });
      continue;
    }

    throw new ProjectDownloadError(
      `"${item.title}" uses an unsupported media format.`,
      400
    );
  }

  return {
    archiveFileName: plan.archiveFileName,
    entries
  };
}

// Wraps a string for safe inclusion inside a bash single-quoted literal.
// The standard idiom: any apostrophe inside the value becomes the four-char
// sequence '\'' (close quote, escaped quote, open quote).
function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

// Browser-equivalent User-Agent so Bunny's edge serves the same fast path
// it serves the in-browser download. Curl's default UA ("curl/8.x") triggers
// Bunny throttling that drops ~60 MB/s downloads to ~4 MB/s; matching Chrome
// makes the script behave indistinguishably from the website fetch.
const CURL_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export async function buildProjectDownloadScript(
  projectId: string,
  refererOrigin: string
): Promise<string> {
  const manifest = await getProjectDownloadManifest(projectId);
  const folderName = manifest.archiveFileName.replace(/\.zip$/i, "");
  const sanitizedFolder = sanitizeArchivePathSegment(folderName, "Project");

  const totalBytes = manifest.entries.reduce(
    (sum, entry) => sum + (entry.kind === "image" ? entry.sizeBytes : entry.sizeBytes ?? 0),
    0
  );
  const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
  const generatedAt = new Date().toISOString();

  const lines: string[] = [];
  // Header comments stay OUTSIDE the heredoc so the user can read them in
  // their terminal scrollback. Keep them free of `!` characters — zsh runs
  // history expansion on interactive command lines before comment parsing.
  lines.push("# InFocus project download — paste this whole block into a Terminal window.");
  lines.push(`# Project: ${manifest.archiveFileName}`);
  lines.push(`# Files: ${manifest.entries.length}   Estimated size: ${totalMB} MB`);
  lines.push(`# Generated: ${generatedAt}`);
  lines.push(`# Signed URLs are valid for ${MANIFEST_SIGNED_URL_TTL_SECONDS / 3600} hours.`);
  lines.push("");
  // Wrap the body in a quoted heredoc fed to bash. The single-quoted delimiter
  // suppresses every form of expansion (history, parameter, command, etc.) on
  // the heredoc body, which is what lets shebangs and filenames containing
  // exclamation marks survive an interactive zsh paste.
  lines.push("bash <<'INFOCUS_DOWNLOAD_EOF'");
  lines.push("set -euo pipefail");
  lines.push("");
  lines.push(`OUTDIR=${shellSingleQuote(sanitizedFolder)}`);
  lines.push(`OUTZIP=${shellSingleQuote(manifest.archiveFileName)}`);
  lines.push("TARGET_DIR=\"${HOME}/Downloads\"");
  lines.push("");
  lines.push("cd \"$TARGET_DIR\"");
  lines.push("rm -rf \"$OUTDIR\" \"$OUTZIP\"");
  lines.push("mkdir -p \"$OUTDIR\"");
  lines.push("");
  // Curl flags shared by every request: HTTP/2, browser-equivalent UA + Referer
  // so Bunny's edge serves the same fast path as the website, and aggressive
  // retry/resume so transient drops on long downloads recover automatically.
  lines.push("CURL_FLAGS=(");
  lines.push("  --fail --location --progress-bar");
  lines.push("  --http2");
  lines.push(`  --user-agent ${shellSingleQuote(CURL_UA)}`);
  lines.push(`  --referer ${shellSingleQuote(refererOrigin.replace(/\/$/, "") + "/")}`);
  lines.push("  --retry 5 --retry-delay 5 --retry-all-errors");
  lines.push("  --continue-at -");
  lines.push(")");
  lines.push("");

  // Pre-create folders so curl --create-dirs isn't strictly required and the
  // structure is easy to inspect mid-download.
  const folderPaths = new Set<string>();
  for (const entry of manifest.entries) {
    const slash = entry.archivePath.lastIndexOf("/");
    if (slash > 0) {
      folderPaths.add(entry.archivePath.slice(0, slash));
    }
  }
  if (folderPaths.size > 0) {
    lines.push("# Pre-create folders");
    for (const folder of [...folderPaths].sort()) {
      lines.push(`mkdir -p "$OUTDIR"/${shellSingleQuote(folder)}`);
    }
    lines.push("");
  }

  let videoIndex = 0;
  for (const entry of manifest.entries) {
    if (entry.kind === "video") {
      videoIndex += 1;
      const sizeMB = entry.sizeBytes !== null ? `${(entry.sizeBytes / 1024 / 1024).toFixed(1)} MB` : "size unknown";
      lines.push(`# [${videoIndex}/${manifest.entries.length}] ${entry.archivePath} (${sizeMB})`);
      lines.push(
        `echo ">> [${videoIndex}/${manifest.entries.length}] Starting download for ${entry.archivePath} (${sizeMB})"`
      );
      lines.push(
        `curl "\${CURL_FLAGS[@]}" -o "$OUTDIR"/${shellSingleQuote(entry.archivePath)} ${shellSingleQuote(entry.signedUrl)}`
      );
      lines.push(
        `echo "   Completed download for ${entry.archivePath}"`
      );
    } else {
      const sizeMB = `${(entry.sizeBytes / 1024 / 1024).toFixed(2)} MB`;
      lines.push(`# image: ${entry.archivePath} (${sizeMB})`);
      lines.push(
        `echo ">> Saving image ${entry.archivePath} (${sizeMB})"`
      );
      // Inline base64 → decode to file. macOS and Linux both accept --decode.
      lines.push(
        `printf '%s' ${shellSingleQuote(entry.imageBase64)} | base64 --decode > "$OUTDIR"/${shellSingleQuote(entry.archivePath)}`
      );
    }
  }

  lines.push("");
  lines.push("echo");
  lines.push("echo \">> All files downloaded. Zipping archive...\"");
  lines.push("# Zip with stored compression (no recompress — same as the website).");
  lines.push("zip -qr0 \"$OUTZIP\" \"$OUTDIR\"");
  lines.push("rm -rf \"$OUTDIR\"");
  lines.push("");
  lines.push("echo");
  lines.push("echo \"Done: $TARGET_DIR/$OUTZIP\"");
  lines.push("INFOCUS_DOWNLOAD_EOF");

  return lines.join("\n") + "\n";
}

function createImageArchiveEntry(item: DownloadableProjectMedia, archivePath: string): StoredZipEntry {
  if (!item.currentVersion) {
    throw new ProjectDownloadError(`"${item.title}" is not ready to download yet.`, 409);
  }

  if (item.currentVersion.sourceType === "IMAGE") {
    if (!item.currentVersion.imageBase64) {
      throw new ProjectDownloadError(`"${item.title}" is not ready to download yet.`, 409);
    }

    return {
      name: archivePath,
      lastModified: item.currentVersion.updatedAt ?? item.updatedAt,
      stream: createBufferStream(Buffer.from(item.currentVersion.imageBase64, "base64"))
    };
  }

  throw new ProjectDownloadError(`"${item.title}" uses an unsupported media format.`, 400);
}

// Number of upstream Bunny fetches kept in flight at once. The zip writer is
// strictly sequential, so concurrency above 2 only buffers more bytes without
// shortening total wall-clock time. PREFETCH=2 means while entry N streams,
// entry N+1's TCP+TLS+HTTP setup runs in parallel — eliminating the
// per-entry slow-start gap that caused the 50→20 MB/s drop on multi-clip
// projects.
const VIDEO_PREFETCH_DEPTH = 2;

type PreparedEntry =
  | {
      kind: "image";
      item: DownloadableProjectMedia;
    }
  | {
      kind: "video";
      item: DownloadableProjectMedia;
      upstream: Response;
      contentType: string | null;
    };

async function prepareVideoEntry(
  item: DownloadableProjectMedia,
  referer: string | null,
  index: number,
  total: number,
  requestId: string
): Promise<PreparedEntry> {
  if (!item.currentVersion) {
    throw new ProjectDownloadError(`"${item.title}" is not ready to download yet.`, 409);
  }

  const baseLog = {
    index,
    total,
    mediaId: item.id,
    title: item.title,
    folder: item.folder?.name ?? null,
    bunnyVideoId: item.currentVersion.bunnyVideoId
  };

  const fetchStart = Date.now();
  logEvent(requestId, "entry-fetch-start", baseLog);

  const { downloadUrl } = createOriginalVideoDownloadToken(item.currentVersion.bunnyVideoId);

  let upstream: Response;
  try {
    upstream = await fetch(downloadUrl, {
      cache: "no-store",
      headers: referer ? { referer } : undefined
    });
  } catch (error) {
    logError(requestId, "entry-fetch-throw", error, {
      ...baseLog,
      elapsedMs: Date.now() - fetchStart
    });
    throw new ProjectDownloadError(`"${item.title}" could not be downloaded right now.`, 502);
  }

  const contentType = upstream.headers.get("content-type");
  const contentLength = upstream.headers.get("content-length");

  logEvent(requestId, "entry-fetch-response", {
    ...baseLog,
    status: upstream.status,
    statusText: upstream.statusText,
    contentLength,
    contentType,
    elapsedMs: Date.now() - fetchStart
  });

  if (!upstream.ok || !upstream.body) {
    logError(
      requestId,
      "entry-fetch-not-ok",
      new Error(`Bunny returned ${upstream.status}`),
      baseLog
    );
    throw new ProjectDownloadError(`"${item.title}" could not be downloaded right now.`, 502);
  }

  if (contentType?.toLowerCase().includes("application/json")) {
    logError(
      requestId,
      "entry-fetch-json-body",
      new Error("Bunny returned JSON instead of video"),
      baseLog
    );
    void upstream.body.cancel().catch(() => undefined);
    throw new ProjectDownloadError(`"${item.title}" could not be downloaded right now.`, 502);
  }

  return { kind: "video", item, upstream, contentType };
}

function trackVideoStream(
  upstream: Response,
  requestId: string,
  baseLog: Record<string, unknown>,
  archivePath: string,
  expectedBytes: number | null
): ReadableStream<Uint8Array> {
  const streamStart = Date.now();
  let receivedBytes = 0;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            receivedBytes += value.byteLength;
            controller.enqueue(value);
          }
        }

        const elapsedMs = Date.now() - streamStart;
        const truncated = expectedBytes !== null && receivedBytes !== expectedBytes;
        logEvent(requestId, truncated ? "entry-stream-truncated" : "entry-stream-end", {
          ...baseLog,
          archivePath,
          receivedBytes,
          expectedBytes,
          elapsedMs,
          throughputMBps:
            elapsedMs > 0 ? +(receivedBytes / 1024 / 1024 / (elapsedMs / 1000)).toFixed(2) : null
        });
        controller.close();
      } catch (error) {
        logError(requestId, "entry-stream-error", error, {
          ...baseLog,
          archivePath,
          receivedBytes,
          expectedBytes,
          elapsedMs: Date.now() - streamStart
        });
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    }
  });
}

export async function createProjectDownloadStream(
  plan: ProjectDownloadPlan,
  referer: string | null,
  requestId: string = "no-id"
) {
  const usedPaths = new Set<string>();
  const totalItems = plan.items.length;
  const startedAt = Date.now();

  logEvent(requestId, "stream-create", {
    archive: plan.archiveFileName,
    totalItems,
    prefetchDepth: VIDEO_PREFETCH_DEPTH
  });

  async function* buildEntries(): AsyncGenerator<StoredZipEntry, void, undefined> {
    const queue: Promise<PreparedEntry>[] = [];
    let nextIndex = 0;

    function enqueueUntilFull() {
      while (queue.length < VIDEO_PREFETCH_DEPTH && nextIndex < plan.items.length) {
        const item = plan.items[nextIndex];
        const oneIndexed = nextIndex + 1;
        nextIndex += 1;

        if (!item.currentVersion) {
          logEvent(requestId, "entry-skipped", {
            index: oneIndexed,
            mediaId: item.id,
            reason: "no-current-version"
          });
          continue;
        }

        if (item.currentVersion.sourceType === "IMAGE") {
          queue.push(Promise.resolve({ kind: "image", item }));
          continue;
        }

        const promise = prepareVideoEntry(item, referer, oneIndexed, totalItems, requestId);
        promise.catch(() => undefined);
        queue.push(promise);
      }
    }

    enqueueUntilFull();

    while (queue.length > 0) {
      const prepared = await queue.shift()!;
      enqueueUntilFull();

      if (prepared.kind === "image") {
        const { item } = prepared;
        if (!item.currentVersion) {
          continue;
        }
        const archivePath = buildUniqueArchivePath(
          usedPaths,
          item.folder?.name ?? null,
          item.title,
          extensionFromImageMimeType(item.currentVersion.imageMimeType)
        );
        logEvent(requestId, "entry-image", {
          mediaId: item.id,
          title: item.title,
          archivePath
        });
        yield createImageArchiveEntry(item, archivePath);
        continue;
      }

      const { item, upstream, contentType } = prepared;
      const archivePath = buildUniqueArchivePath(
        usedPaths,
        item.folder?.name ?? null,
        item.title,
        extensionFromVideoContentType(contentType)
      );

      const baseLog = {
        mediaId: item.id,
        title: item.title,
        folder: item.folder?.name ?? null,
        bunnyVideoId: item.currentVersion?.bunnyVideoId ?? null
      };
      const contentLength = upstream.headers.get("content-length");
      const expectedBytes = contentLength ? Number(contentLength) : null;

      logEvent(requestId, "entry-stream-start", {
        ...baseLog,
        archivePath,
        expectedBytes
      });

      yield {
        name: archivePath,
        lastModified: item.currentVersion?.updatedAt ?? item.updatedAt,
        stream: trackVideoStream(upstream, requestId, baseLog, archivePath, expectedBytes)
      };
    }
  }

  return createStoredZipStream(buildEntries(), {
    onEntryWritten: ({ name, bytes, offset }) => {
      logEvent(requestId, "zip-entry-written", {
        archivePath: name,
        bytes: Number(bytes),
        archiveOffset: Number(offset)
      });
    },
    onCancel: () => {
      logEvent(requestId, "zip-cancelled-by-client", {
        elapsedMs: Date.now() - startedAt
      });
    },
    onError: (error) => {
      logError(requestId, "zip-stream-error", error, {
        elapsedMs: Date.now() - startedAt
      });
    },
    onComplete: ({ totalBytes, entryCount, usedZip64 }) => {
      logEvent(requestId, "zip-complete", {
        totalBytes: Number(totalBytes),
        entryCount,
        usedZip64,
        elapsedMs: Date.now() - startedAt
      });
    }
  });
}

export function getProjectDownloadErrorResponse(error: unknown) {
  if (error instanceof ProjectDownloadError) {
    return {
      message: error.message,
      status: error.status
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      status: 400
    };
  }

  return {
    message: "Unexpected server error",
    status: 500
  };
}
