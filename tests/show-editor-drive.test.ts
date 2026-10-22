import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), mint: vi.fn() }));

vi.mock("@/src/lib/nas-storage", async (original) => ({
  ...await original<typeof import("@/src/lib/nas-storage")>(),
  driveFetch: mocks.fetch,
  nasMintDownloadUrl: mocks.mint
}));

import { listShowRecordings, recordingPreviewUrl } from "@/src/server/show-editor-drive";

const NOW = new Date("2026-10-21T22:00:00Z");

function listing(items: { name: string; path: string; isDir?: boolean; size?: number; mtime: string }[]) {
  return new Response(JSON.stringify({ items: items.map((item) => ({ isDir: false, size: 10, ...item })) }), { status: 200 });
}

describe("listing Drive Shows/", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("opens one level of subfolders and marks each file's folder", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      const path = decodeURIComponent(url.split("path=")[1]);
      if (path === "Shows") {
        return listing([
          { name: "InFocus Show 10-22-2026.mov", path: "Shows/InFocus Show 10-22-2026.mov", mtime: "2026-10-21T18:00:00Z" },
          { name: "ISO 10-22", path: "Shows/ISO 10-22", isDir: true, mtime: "2026-10-21T19:00:00Z" },
          { name: "#recycle", path: "Shows/#recycle", isDir: true, mtime: "2026-10-21T19:00:00Z" },
          { name: "notes.prproj", path: "Shows/notes.prproj", mtime: "2026-10-21T18:00:00Z" }
        ]);
      }
      if (path === "Shows/ISO 10-22") {
        return listing([
          { name: "InFocus Show 10-22-2026.mov", path: "Shows/ISO 10-22/InFocus Show 10-22-2026.mov", mtime: "2026-10-21T19:00:00Z" },
          { name: "Deeper", path: "Shows/ISO 10-22/Deeper", isDir: true, mtime: "2026-10-21T19:00:00Z" }
        ]);
      }
      throw new Error(`unexpected listing ${path}`);
    });
    const recordings = await listShowRecordings(NOW);
    expect(recordings.map((recording) => [recording.path, recording.folder])).toEqual([
      ["Shows/ISO 10-22/InFocus Show 10-22-2026.mov", "Shows/ISO 10-22"],
      ["Shows/InFocus Show 10-22-2026.mov", null]
    ]);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("a subfolder that can't be read is skipped, not fatal", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      const path = decodeURIComponent(url.split("path=")[1]);
      if (path === "Shows") {
        return listing([
          { name: "a.mov", path: "Shows/a.mov", mtime: "2026-10-21T18:00:00Z" },
          { name: "Locked", path: "Shows/Locked", isDir: true, mtime: "2026-10-21T19:00:00Z" }
        ]);
      }
      return new Response("forbidden", { status: 403 });
    });
    expect((await listShowRecordings(NOW)).map((recording) => recording.path)).toEqual(["Shows/a.mov"]);
  });

  it("opens only the 12 newest subfolders", async () => {
    const folders = Array.from({ length: 15 }, (_, index) => ({
      name: `F${index}`, path: `Shows/F${index}`, isDir: true, mtime: new Date(NOW.getTime() - index * 3600_000).toISOString()
    }));
    mocks.fetch.mockImplementation(async (url: string) => {
      const path = decodeURIComponent(url.split("path=")[1]);
      return path === "Shows" ? listing(folders) : listing([]);
    });
    await listShowRecordings(NOW);
    const opened = mocks.fetch.mock.calls.map(([url]) => decodeURIComponent(String(url).split("path=")[1])).filter((path) => path !== "Shows");
    expect(opened).toHaveLength(12);
    expect(opened).not.toContain("Shows/F14");
  });
});

describe("recording preview links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockImplementation(async () =>
      listing([{ name: "InFocus Show 10-22-2026.mov", path: "Shows/InFocus Show 10-22-2026.mov", mtime: "2026-10-21T18:00:00Z" }]));
    mocks.mint.mockResolvedValue("https://drive.example.org/api/service/file?token=r.1.x&inline=true");
  });

  it("mints a web playback link for a listed recording", async () => {
    const url = await recordingPreviewUrl("Shows/InFocus Show 10-22-2026.mov", NOW);
    expect(url).toBe("https://drive.example.org/api/service/file?token=r.1.x&inline=true&web=1");
    expect(mocks.mint).toHaveBeenCalledWith("Shows/InFocus Show 10-22-2026.mov", 3 * 3600);
  });

  it("refuses a path outside Shows/ without asking Drive, and one the listing doesn't have", async () => {
    await expect(recordingPreviewUrl("Shows/../Package Storage/x.mov", NOW)).rejects.toMatchObject({ status: 400 });
    expect(mocks.fetch).not.toHaveBeenCalled();
    await expect(recordingPreviewUrl("Shows/other.mov", NOW)).rejects.toMatchObject({ status: 404 });
    expect(mocks.mint).not.toHaveBeenCalled();
  });
});
