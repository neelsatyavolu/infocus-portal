import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  findUnique: vi.fn(),
  resolveOriginalDownloadUrl: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile
}));

vi.mock("@/src/lib/platform-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/platform-admin")>();
  return { ...actual, getPlatformAccess: mocks.getPlatformAccess };
});

vi.mock("@/src/lib/prisma", () => ({
  prisma: { packageProgressRow: { findUnique: mocks.findUnique } }
}));

vi.mock("@/src/lib/media-playback", () => ({
  resolveOriginalDownloadUrl: mocks.resolveOriginalDownloadUrl
}));

import { GET, HEAD } from "@/app/api/package-cycle/a-roll/[rowId]/download/route";
import { createStoredZipStream } from "@/src/lib/zip-stream";

function clip(id: string, title: string, options: { status?: string; size?: number; file?: string } = {}) {
  return {
    mediaItem: {
      id,
      title,
      currentVersion: {
        id: `${id}_v1`,
        status: options.status ?? "READY",
        bunnyVideoId: `nas_${id}`,
        storageProvider: "NAS",
        nasPath: `Package Storage/Cycle 2/Airport Day/A-roll B-roll/${options.file ?? `${id}.MOV`}`,
        storageSizeBytes: BigInt(options.size ?? 1000),
        updatedAt: new Date("2026-10-01T12:00:00Z")
      }
    }
  };
}

function rowWith(stageMedia: ReturnType<typeof clip>[]) {
  return {
    cycleNumber: 2,
    groupTopic: "Airport Day",
    members: [{ userId: "student_1" }],
    stageMedia
  };
}

function call(handler: typeof GET, query = "") {
  return handler(new Request(`https://infocus.test/api/package-cycle/a-roll/row_1/download${query}`), {
    params: Promise.resolve({ rowId: "row_1" })
  });
}

describe("A-roll/B-roll download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.requireUserId.mockResolvedValue("student_1");
    mocks.syncUserProfile.mockResolvedValue({ email: "abby@example.edu" });
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    mocks.findUnique.mockResolvedValue(
      rowWith([clip("a", "A-roll · Interview"), clip("b", "B-roll · Runway"), clip("c", "B-roll · Gate", { status: "PROCESSING" })])
    );
    mocks.resolveOriginalDownloadUrl.mockImplementation(
      async (version: { nasPath: string }) => `https://drive.test/api/service/file?path=${encodeURIComponent(version.nasPath)}&token=t`
    );
  });

  it("redirects one clip to its signed original as an attachment", async () => {
    const response = await call(GET, "?id=a");

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("inline")).toBe("0");
    expect(location.searchParams.get("path")).toContain("a.MOV");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("zips every ready clip into A-roll and B-roll folders", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(`bytes of ${new URL(url).searchParams.get("path")}`));
    vi.stubGlobal("fetch", fetchMock);

    const response = await call(GET);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain("Airport Day - Cycle 2 footage.zip");
    const archive = Buffer.from(await response.arrayBuffer()).toString("latin1");
    expect(archive).toContain("A-roll/a.MOV");
    expect(archive).toContain("B-roll/b.MOV");
    // The processing clip is left out.
    expect(archive).not.toContain("c.MOV");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("zips only the selected clips", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x")));

    const response = await call(GET, "?id=a&id=b");
    const archive = Buffer.from(await response.arrayBuffer()).toString("latin1");

    expect(archive).toContain("A-roll/a.MOV");
    expect(archive).toContain("B-roll/b.MOV");
  });

  it("forbids students who are not on the package", async () => {
    mocks.requireUserId.mockResolvedValue("student_2");

    const response = await call(GET, "?id=a");

    expect(response.status).toBe(403);
  });

  it("lets producers download any package", async () => {
    mocks.requireUserId.mockResolvedValue("producer_1");
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });

    const response = await call(GET, "?id=b");

    expect(response.status).toBe(302);
  });

  it("refuses a zip over the size cap, with the reason on HEAD", async () => {
    mocks.findUnique.mockResolvedValue(
      rowWith([clip("a", "A-roll · One", { size: 25 * 1024 ** 3 }), clip("b", "A-roll · Two", { size: 25 * 1024 ** 3 })])
    );

    const response = await call(HEAD);

    expect(response.status).toBe(413);
    expect(decodeURIComponent(response.headers.get("x-infocus-error-message") ?? "")).toContain("40 GB");
  });

  it("answers HEAD with 204 when the download can start", async () => {
    const response = await call(HEAD, "?id=a&id=b");

    expect(response.status).toBe(204);
    expect(mocks.resolveOriginalDownloadUrl).not.toHaveBeenCalled();
  });

  it("says when the picked clips are not ready", async () => {
    const response = await call(HEAD, "?id=c");

    expect(response.status).toBe(409);
    expect(decodeURIComponent(response.headers.get("x-infocus-error-message") ?? "")).toContain("not ready");
  });
});

describe("stored zip backpressure", () => {
  it("reads the source only as fast as the zip is consumed", async () => {
    let pulled = 0;
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled += 1;
          if (pulled > 100) controller.close();
          else controller.enqueue(new Uint8Array(1024));
        }
      },
      { highWaterMark: 0 }
    );
    const reader = createStoredZipStream([{ name: "clip.mov", stream: source }]).getReader();

    await reader.read(); // local header
    await reader.read(); // first chunk
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(pulled).toBeLessThanOrEqual(3);
    await reader.cancel();
  });
});
