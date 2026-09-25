import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(), update: vi.fn(), findMany: vi.fn(),
  token: vi.fn(), verify: vi.fn(), size: vi.fn(), begin: vi.fn(), progress: vi.fn(), chunk: vi.fn(),
  check: vi.fn(), playlists: vi.fn(), createPlaylist: vi.fn(), hasVideo: vi.fn(), addVideo: vi.fn(),
  thumbnail: vi.fn(), download: vi.fn(), fetch: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: {
  showPublication: { findUnique: mocks.find, update: mocks.update, findMany: mocks.findMany }
} }));
vi.mock("@/src/lib/nas-storage", async (original) => ({
  ...await original<typeof import("@/src/lib/nas-storage")>(),
  nasMintDownloadUrl: mocks.download
}));
vi.mock("@/src/server/youtube-client", async (original) => ({
  ...await original<typeof import("@/src/server/youtube-client")>(),
  youtubePublishingConfig: () => ({ channelId: "channel", startDate: "2026-09-19", hour: 0 }),
  youtubeAccessToken: mocks.token, verifyYoutubeChannel: mocks.verify, sourceVideoSize: mocks.size,
  beginYoutubeShowUpload: mocks.begin, readUploadProgress: mocks.progress, uploadYoutubeChunk: mocks.chunk,
  checkScheduledYoutubeVideo: mocks.check, listYoutubePlaylists: mocks.playlists,
  createYoutubePlaylist: mocks.createPlaylist, playlistHasVideo: mocks.hasVideo,
  addVideoToPlaylist: mocks.addVideo, setYoutubeThumbnail: mocks.thumbnail
}));

import { PublicationError } from "@/src/server/youtube-client";
import { advanceShowPublication } from "@/src/server/show-publishing-worker";

const NOW = new Date("2026-09-21T20:00:00Z");
const base = {
  id: "pub", showDate: "2026-09-22", status: "UPLOADING", nasPath: "Package Storage/Shows/2026-09-22/show-1.mp4",
  title: "InFocus News | Tuesday, September 22nd, 2026", description: "Anchors …",
  publishAt: new Date("2026-09-22T15:30:00Z"), seasonNumber: 31, playlistId: null, channelId: "channel",
  sourceSize: null, uploadSessionUrl: null, videoId: null, thumbnailSetAt: null, playlistAddedAt: null
};

function lastUpdateData() {
  return mocks.update.mock.calls.at(-1)?.[0].data;
}

describe("advanceShowPublication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.token.mockResolvedValue("token");
    mocks.update.mockResolvedValue({});
    mocks.download.mockResolvedValue("https://drive.example/file");
  });

  it("ignores drafts and finished uploads", async () => {
    mocks.find.mockResolvedValue({ ...base, status: "DRAFT" });
    expect(await advanceShowPublication("pub", NOW)).toEqual({ more: false });
    mocks.find.mockResolvedValue({ ...base, status: "SCHEDULED" });
    expect(await advanceShowPublication("pub", NOW)).toEqual({ more: false });
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it("starts a private scheduled upload and saves the session before sending bytes", async () => {
    mocks.find.mockResolvedValue(base);
    mocks.size.mockResolvedValue(100);
    mocks.begin.mockResolvedValue("https://www.googleapis.com/upload/youtube/v3/videos?upload_id=x");
    expect(await advanceShowPublication("pub", NOW)).toEqual({ more: true });
    expect(mocks.verify).toHaveBeenCalledWith("token", "channel");
    expect(mocks.begin).toHaveBeenCalledWith("token", 100, {
      title: base.title, description: base.description, publishAt: base.publishAt
    });
    expect(lastUpdateData()).toMatchObject({ sourceSize: 100n, uploadedBytes: 0n, uploadSessionUrl: expect.any(String) });
    expect(mocks.chunk).not.toHaveBeenCalled();
  });

  it("fails instead of starting after the scheduled time has passed", async () => {
    mocks.find.mockResolvedValue(base);
    await advanceShowPublication("pub", new Date("2026-09-22T16:00:00Z"));
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(lastUpdateData()).toMatchObject({ status: "FAILED", lastError: expect.stringContaining("scheduled time") });
  });

  it("uploads a chunk and moves to processing when YouTube returns the video", async () => {
    mocks.find.mockResolvedValue({ ...base, sourceSize: 100n, uploadSessionUrl: "session" });
    mocks.progress.mockResolvedValue({ offset: 40 });
    mocks.chunk.mockResolvedValue({ offset: 100, videoId: "abcdefgh_12" });
    expect(await advanceShowPublication("pub", NOW)).toEqual({ more: true });
    expect(mocks.chunk).toHaveBeenCalledWith(expect.objectContaining({ offset: 40, size: 100 }));
    expect(lastUpdateData()).toMatchObject({ videoId: "abcdefgh_12", status: "PROCESSING", uploadedBytes: 100n });
  });

  it("records how many bytes YouTube has confirmed after each chunk", async () => {
    mocks.find.mockResolvedValue({ ...base, sourceSize: 100n, uploadSessionUrl: "session" });
    mocks.progress.mockResolvedValue({ offset: 40 });
    mocks.chunk.mockResolvedValue({ offset: 80 });
    expect(await advanceShowPublication("pub", NOW)).toEqual({ more: true });
    expect(lastUpdateData()).toMatchObject({ uploadedBytes: 80n });
    expect(lastUpdateData().status).toBeUndefined();
  });

  it("waits for YouTube processing, then finalizes", async () => {
    mocks.find.mockResolvedValue({ ...base, status: "PROCESSING", videoId: "abcdefgh_12" });
    mocks.check.mockResolvedValue(false);
    expect(await advanceShowPublication("pub", NOW)).toEqual({ more: false });
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.check.mockResolvedValue(true);
    expect(await advanceShowPublication("pub", NOW)).toEqual({ more: true });
    expect(lastUpdateData()).toMatchObject({ status: "FINALIZING" });
  });

  it("sets the thumbnail, creates the new season playlist, and adds the video", async () => {
    mocks.find.mockResolvedValue({ ...base, status: "FINALIZING", videoId: "abcdefgh_12", seasonNumber: 32 });
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    mocks.playlists.mockResolvedValue([{ id: "PL31", title: "InFocus News | Season 31" }]);
    mocks.createPlaylist.mockResolvedValue("PL32");
    mocks.hasVideo.mockResolvedValue(false);
    expect(await advanceShowPublication("pub", NOW)).toEqual({ more: false });
    expect(mocks.download).toHaveBeenCalledWith("Package Storage/Shows/2026-09-22/show-1.poster.jpg", expect.any(Number));
    expect(mocks.thumbnail).toHaveBeenCalledWith("token", "abcdefgh_12", expect.any(ArrayBuffer));
    expect(mocks.createPlaylist).toHaveBeenCalledWith("token", "InFocus News | Season 32");
    expect(mocks.addVideo).toHaveBeenCalledWith("token", "PL32", "abcdefgh_12");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ playlistId: "PL32" }) }));
    expect(lastUpdateData()).toMatchObject({ status: "SCHEDULED", playlistAddedAt: NOW });
  });

  it("reuses an existing season playlist and skips steps already done", async () => {
    mocks.find.mockResolvedValue({ ...base, status: "FINALIZING", videoId: "abcdefgh_12", thumbnailSetAt: NOW });
    mocks.playlists.mockResolvedValue([{ id: "PL31", title: "InFocus News | Season 31" }]);
    mocks.hasVideo.mockResolvedValue(true);
    await advanceShowPublication("pub", NOW);
    expect(mocks.thumbnail).not.toHaveBeenCalled();
    expect(mocks.createPlaylist).not.toHaveBeenCalled();
    expect(mocks.addVideo).not.toHaveBeenCalled();
    expect(lastUpdateData()).toMatchObject({ status: "SCHEDULED" });
  });

  it("skips the thumbnail when no poster was saved", async () => {
    mocks.find.mockResolvedValue({ ...base, status: "FINALIZING", videoId: "abcdefgh_12", playlistAddedAt: NOW });
    mocks.fetch.mockResolvedValue(new Response(null, { status: 404 }));
    await advanceShowPublication("pub", NOW);
    expect(mocks.thumbnail).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ thumbnailSetAt: NOW }) }));
  });

  it("marks permanent YouTube errors as failed without leaking details", async () => {
    mocks.find.mockResolvedValue({ ...base, status: "FINALIZING", videoId: "abcdefgh_12", thumbnailSetAt: NOW });
    mocks.playlists.mockResolvedValue([]);
    mocks.createPlaylist.mockRejectedValue(new PublicationError("YouTube playlist creation was refused (HTTP 403).", true));
    await advanceShowPublication("pub", NOW);
    expect(lastUpdateData()).toMatchObject({ status: "FAILED", lastError: expect.stringContaining("403") });
  });

  it("keeps retrying transient failures", async () => {
    mocks.find.mockResolvedValue({ ...base, sourceSize: 100n, uploadSessionUrl: "session" });
    mocks.progress.mockRejectedValue(new Error("socket hang up https://secret"));
    await advanceShowPublication("pub", NOW);
    const data = lastUpdateData();
    expect(data.status).toBeUndefined();
    expect(data.lastError).not.toContain("secret");
  });
});
