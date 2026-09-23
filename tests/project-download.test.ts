import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStoredZipStream } from "@/src/lib/zip-stream";
import {
  buildUniqueArchivePath,
  createProjectDownloadStream,
  sanitizeArchivePathSegment
} from "@/src/server/project-download";

vi.mock("@/src/lib/bunny", () => ({
  createOriginalVideoDownloadToken: (videoId: string) => ({
    token: "stub-token",
    expiresAt: 0,
    downloadUrl: `https://stub.bunny/${videoId}`
  })
}));

type ParsedZipEntry = {
  content: string;
  name: string;
};

async function readStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      totalLength += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const buffer = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return buffer;
}

function readUInt64LE(buffer: Uint8Array, offset: number) {
  const view = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return Number(view.readBigUInt64LE(offset));
}

function readZip64ExtraValues(extra: Uint8Array) {
  let offset = 0;

  while (offset + 4 <= extra.byteLength) {
    const view = new DataView(extra.buffer, extra.byteOffset + offset, extra.byteLength - offset);
    const headerId = view.getUint16(0, true);
    const size = view.getUint16(2, true);
    const start = offset + 4;
    const end = start + size;

    if (headerId === 0x0001) {
      const values: number[] = [];

      for (let cursor = start; cursor < end; cursor += 8) {
        values.push(readUInt64LE(extra, cursor));
      }

      return values;
    }

    offset = end;
  }

  return null;
}

function parseStoredZip(buffer: Uint8Array) {
  const eocdOffset = buffer.byteLength - 22;
  const eocdView = new DataView(buffer.buffer, buffer.byteOffset + eocdOffset, 22);
  expect(eocdView.getUint32(0, true)).toBe(0x06054b50);

  let totalEntries: number = eocdView.getUint16(10, true);
  let centralDirectoryOffset: number = eocdView.getUint32(16, true);
  const entriesNeedZip64 = totalEntries === 0xffff;
  const offsetNeedsZip64 = centralDirectoryOffset === 0xffffffff;

  if (entriesNeedZip64 || offsetNeedsZip64) {
    const locatorOffset = eocdOffset - 20;
    const locatorView = new DataView(buffer.buffer, buffer.byteOffset + locatorOffset, 20);
    expect(locatorView.getUint32(0, true)).toBe(0x07064b50);

    const zip64EndOffset = readUInt64LE(buffer, locatorOffset + 8);
    const zip64EndView = new DataView(buffer.buffer, buffer.byteOffset + zip64EndOffset, 56);
    expect(zip64EndView.getUint32(0, true)).toBe(0x06064b50);

    totalEntries = readUInt64LE(buffer, zip64EndOffset + 32);
    centralDirectoryOffset = readUInt64LE(buffer, zip64EndOffset + 48);
  }

  const entries: ParsedZipEntry[] = [];
  let centralOffset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    const headerView = new DataView(buffer.buffer, buffer.byteOffset + centralOffset, 46);
    expect(headerView.getUint32(0, true)).toBe(0x02014b50);

    let compressedSize: number = headerView.getUint32(20, true);
    let uncompressedSize: number = headerView.getUint32(24, true);
    let localHeaderOffset: number = headerView.getUint32(42, true);

    const fileNameLength = headerView.getUint16(28, true);
    const extraLength = headerView.getUint16(30, true);
    const commentLength = headerView.getUint16(32, true);
    const fileNameStart = centralOffset + 46;
    const extraStart = fileNameStart + fileNameLength;
    const extraEnd = extraStart + extraLength;
    const fileName = Buffer.from(buffer.slice(fileNameStart, extraStart)).toString("utf8");

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      const values = readZip64ExtraValues(buffer.slice(extraStart, extraEnd));
      expect(values).not.toBeNull();
      [uncompressedSize, compressedSize, localHeaderOffset] = values as number[];
    }

    const localHeaderView = new DataView(buffer.buffer, buffer.byteOffset + localHeaderOffset, 30);
    expect(localHeaderView.getUint32(0, true)).toBe(0x04034b50);

    // Per APPNOTE 4.3.9.1 the local header MUST report zero sizes when the
    // data-descriptor flag (bit 3) is set; the real values live in the trailing
    // descriptor and the central directory.
    expect(localHeaderView.getUint16(6, true) & 0x0008).toBe(0x0008);
    expect(localHeaderView.getUint32(14, true)).toBe(0);
    expect(localHeaderView.getUint32(18, true)).toBe(0);
    expect(localHeaderView.getUint32(22, true)).toBe(0);

    const localNameLength = localHeaderView.getUint16(26, true);
    const localExtraLength = localHeaderView.getUint16(28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    const content = Buffer.from(buffer.slice(dataStart, dataEnd)).toString("utf8");

    expect(uncompressedSize).toBe(compressedSize);
    entries.push({ name: fileName, content });
    centralOffset = extraEnd + commentLength;
  }

  return entries;
}

describe("project download helpers", () => {
  it("sanitizes archive names and deduplicates folder paths", () => {
    expect(sanitizeArchivePathSegment(' Package Cycle 1 / Final ', "Project")).toBe("Package Cycle 1 Final");

    const usedPaths = new Set<string>();
    expect(buildUniqueArchivePath(usedPaths, "Initial Cut", "Scene 1", ".mp4")).toBe("Initial Cut/Scene 1.mp4");
    expect(buildUniqueArchivePath(usedPaths, "Initial Cut", "Scene 1", ".mp4")).toBe("Initial Cut/Scene 1 (2).mp4");
    expect(buildUniqueArchivePath(usedPaths, null, "Scene 1", ".mp4")).toBe("Scene 1.mp4");
  });

  it("writes a stored zip that preserves folder paths and file contents", async () => {
    const encoder = new TextEncoder();
    const stream = createStoredZipStream([
      {
        name: "Initial Cut/Clip A.txt",
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode("alpha"));
            controller.close();
          }
        })
      },
      {
        name: "Final Cut/Clip B.txt",
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode("beta"));
            controller.close();
          }
        })
      }
    ]);

    const archive = await readStream(stream);
    const entries = parseStoredZip(archive);

    expect(entries).toEqual([
      { name: "Initial Cut/Clip A.txt", content: "alpha" },
      { name: "Final Cut/Clip B.txt", content: "beta" }
    ]);
  });

  it("starts the next upstream fetch before the current entry finishes streaming", async () => {
    const fetchCallTimes: Array<{ videoId: string; at: number }> = [];
    const releaseHandlers = new Map<string, () => void>();
    const encoder = new TextEncoder();
    let now = 0;

    function makeBody(videoId: string, payload: string) {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          // Hold the body until released so the test can verify the next
          // upstream fetch is initiated while this one is still in flight.
          releaseHandlers.set(videoId, () => {
            controller.enqueue(encoder.encode(payload));
            controller.close();
          });
        }
      });
    }

    const fetchSpy = vi.fn(async (url: string | URL) => {
      const videoId = String(url).split("/").pop() ?? "";
      fetchCallTimes.push({ videoId, at: now++ });
      return new Response(makeBody(videoId, `payload-${videoId}`), {
        status: 200,
        headers: { "content-type": "video/mp4" }
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const plan = {
      archiveFileName: "test.zip",
      items: [
        {
          id: "m1",
          title: "Clip 1",
          updatedAt: new Date(),
          folder: null,
          currentVersion: {
            id: "v1",
            sourceType: "VIDEO" as const,
            status: "READY" as const,
            bunnyVideoId: "vid1",
            imageBase64: null,
            imageMimeType: null,
            updatedAt: new Date(),
            storageSizeBytes: null
          }
        },
        {
          id: "m2",
          title: "Clip 2",
          updatedAt: new Date(),
          folder: null,
          currentVersion: {
            id: "v2",
            sourceType: "VIDEO" as const,
            status: "READY" as const,
            bunnyVideoId: "vid2",
            imageBase64: null,
            imageMimeType: null,
            updatedAt: new Date(),
            storageSizeBytes: null
          }
        },
        {
          id: "m3",
          title: "Clip 3",
          updatedAt: new Date(),
          folder: null,
          currentVersion: {
            id: "v3",
            sourceType: "VIDEO" as const,
            status: "READY" as const,
            bunnyVideoId: "vid3",
            imageBase64: null,
            imageMimeType: null,
            updatedAt: new Date(),
            storageSizeBytes: null
          }
        }
      ]
    };

    const stream = await createProjectDownloadStream(plan, null);
    const reader = stream.getReader();

    // Drain until the zip writer has begun on the first entry. After yielding
    // entry 1, the prefetch should have already fired fetch for entry 2.
    async function pump() {
      while (true) {
        const { done, value } = await reader.read();
        if (done || (value && value.byteLength > 0)) {
          return done;
        }
      }
    }

    // Release entry 1's body so the writer can finish it.
    setTimeout(() => releaseHandlers.get("vid1")?.(), 5);
    await pump();

    // By the time we have read any bytes from entry 1, entry 2's upstream
    // fetch must already have been issued (PREFETCH=2).
    expect(fetchCallTimes.map((c) => c.videoId)).toContain("vid2");
    const v1Time = fetchCallTimes.find((c) => c.videoId === "vid1")!.at;
    const v2Time = fetchCallTimes.find((c) => c.videoId === "vid2")!.at;
    expect(v2Time).toBeGreaterThan(v1Time);

    // Release the rest so the stream can complete.
    releaseHandlers.get("vid2")?.();
    setTimeout(() => releaseHandlers.get("vid3")?.(), 5);
    while (!(await pump())) {
      // drain
    }

    // All three fetches issued, in order.
    expect(fetchCallTimes.map((c) => c.videoId)).toEqual(["vid1", "vid2", "vid3"]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("produces an archive that the system unzip tool accepts", async () => {
    const encoder = new TextEncoder();
    const stream = createStoredZipStream([
      {
        name: "folder/clip a.txt",
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode("hello"));
            controller.close();
          }
        })
      },
      {
        name: "folder/clip b.txt",
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode("world"));
            controller.close();
          }
        })
      }
    ]);

    const archive = await readStream(stream);
    const dir = mkdtempSync(join(tmpdir(), "zip-stream-"));
    const archivePath = join(dir, "archive.zip");
    writeFileSync(archivePath, archive);

    try {
      execFileSync("unzip", ["-t", archivePath], { stdio: "pipe" });
      const aOut = execFileSync("unzip", ["-p", archivePath, "folder/clip a.txt"]).toString("utf8");
      const bOut = execFileSync("unzip", ["-p", archivePath, "folder/clip b.txt"]).toString("utf8");
      expect(aOut).toBe("hello");
      expect(bOut).toBe("world");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
