import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  requireMediaAccess: vi.fn(),
  readCachedTranscript: vi.fn(),
  generateTranscript: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: { mediaVersion: { findFirst: mocks.findFirst } }
}));

vi.mock("@/src/server/memberships", () => ({
  requireMediaAccess: mocks.requireMediaAccess
}));

vi.mock("@/src/server/media-transcript", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/server/media-transcript")>()),
  readCachedTranscript: mocks.readCachedTranscript,
  generateTranscript: mocks.generateTranscript
}));

import { POST } from "@/app/api/media/[mediaId]/versions/[versionId]/transcript/route";
import { nasTranscriptPath } from "@/src/lib/nas-storage";
import { normalizeTranscriptSegments, parseTranscriptTimestamp } from "@/src/server/media-transcript";

const transcript = {
  versionId: "version_1",
  model: "gemini",
  createdAt: "2026-09-26T00:00:00.000Z",
  segments: [{ start: 2, text: "Good morning, Paly." }]
};

function callRoute(versionId = "version_1") {
  return POST(new Request(`https://infocus.test/api/media/media_1/versions/${versionId}/transcript`, { method: "POST" }), {
    params: Promise.resolve({ mediaId: "media_1", versionId })
  });
}

describe("transcript helpers", () => {
  it("parses M:SS, H:MM:SS and plain seconds", () => {
    expect(parseTranscriptTimestamp("0:05")).toBe(5);
    expect(parseTranscriptTimestamp("1:05")).toBe(65);
    expect(parseTranscriptTimestamp("1:02:03")).toBe(3723);
    expect(parseTranscriptTimestamp("12.5")).toBe(12.5);
    expect(parseTranscriptTimestamp("soon")).toBeNull();
    expect(parseTranscriptTimestamp("1:2:3:4")).toBeNull();
  });

  it("drops empty segments, sorts by start and clamps to the video length", () => {
    expect(
      normalizeTranscriptSegments(
        [
          { start: "0:09", text: "  second   line " },
          { start: "0:01", text: "first line" },
          { start: "0:04", text: "   " },
          { start: "9:00", text: "past the end" },
          { start: "??", text: "unreadable start" }
        ],
        30
      )
    ).toEqual([
      { start: 0, text: "unreadable start" },
      { start: 1, text: "first line" },
      { start: 9, text: "second line" },
      { start: 30, text: "past the end" }
    ]);
  });

  it("stores the transcript beside the video", () => {
    expect(nasTranscriptPath("Package Cycles/Cycle 1/Final Cut/Topic/v2/clip.final.mp4")).toBe(
      "Package Cycles/Cycle 1/Final Cut/Topic/v2/clip.final.transcript.json"
    );
  });
});

describe("transcript route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMediaAccess.mockResolvedValue({ userId: "user_1" });
    mocks.findFirst.mockResolvedValue({
      id: "version_1",
      bunnyVideoId: "nas:1",
      storageProvider: "NAS",
      nasPath: "Package Cycles/clip.mp4",
      durationSeconds: 60,
      sourceType: "VIDEO",
      status: "READY"
    });
  });

  it("returns the cached transcript without calling Gemini", async () => {
    mocks.readCachedTranscript.mockResolvedValue(transcript);

    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { transcript } });
    expect(mocks.generateTranscript).not.toHaveBeenCalled();
  });

  it("transcribes when nothing is cached", async () => {
    mocks.readCachedTranscript.mockResolvedValue(null);
    mocks.generateTranscript.mockResolvedValue(transcript);

    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(mocks.generateTranscript).toHaveBeenCalledWith(expect.objectContaining({ id: "version_1" }));
  });

  it("requires media access", async () => {
    mocks.requireMediaAccess.mockRejectedValue(new Error("FORBIDDEN"));

    const response = await callRoute();

    expect(response.status).toBe(403);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("rejects images and unfinished uploads", async () => {
    mocks.findFirst.mockResolvedValue({ id: "version_1", sourceType: "VIDEO", status: "PROCESSING" });

    const response = await callRoute();

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("Only a finished video can be transcribed.");
    expect(mocks.readCachedTranscript).not.toHaveBeenCalled();
  });

  it("returns 404 for a version of another media item", async () => {
    mocks.findFirst.mockResolvedValue(null);

    expect((await callRoute("version_other")).status).toBe(404);
  });

  it("rate limits new transcriptions per user", async () => {
    mocks.requireMediaAccess.mockResolvedValue({ userId: "user_rate_limited" });
    mocks.readCachedTranscript.mockResolvedValue(null);
    mocks.generateTranscript.mockResolvedValue(transcript);

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await callRoute()).status);
    }

    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
