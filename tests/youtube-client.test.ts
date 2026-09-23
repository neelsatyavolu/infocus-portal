import { afterEach, describe, expect, it, vi } from "vitest";
import { readUploadProgress, uploadYoutubeChunk, checkYoutubeVideo, PublicationError } from "@/src/server/youtube-client";

afterEach(() => vi.unstubAllGlobals());

describe("YouTube resumable transport", () => {
  it("recovers a completed upload after a lost response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "abcdefgh_12" })));
    expect(await readUploadProgress("https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test", "token", 20)).toEqual({ videoId: "abcdefgh_12", offset: 20 });
  });
  it("uses Google's acknowledged offset, including empty uploads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 308, headers: { Range: "bytes=0-7" } })).mockResolvedValueOnce(new Response(null, { status: 308 })));
    expect(await readUploadProgress("https://www.googleapis.com/upload/youtube/v3/videos", "token", 20)).toEqual({ offset: 8 });
    expect(await readUploadProgress("https://www.googleapis.com/upload/youtube/v3/videos", "token", 20)).toEqual({ offset: 0 });
  });
  it("stops on expired sessions instead of creating another video", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(readUploadProgress("https://www.googleapis.com/upload/youtube/v3/videos", "token", 20)).rejects.toMatchObject({ permanent: true });
  });
  it("does not buffer a source server that ignores Range", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("huge video", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadYoutubeChunk({ sourceUrl: "https://drive.example/video", sessionUrl: "https://www.googleapis.com/upload/youtube/v3/videos", token: "token", size: 20, offset: 8 })).rejects.toBeInstanceOf(PublicationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("requires processed, unlisted, embeddable video on the expected channel", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ items: [{ snippet: { channelId: "channel" }, status: { uploadStatus: "processed", privacyStatus: "private", embeddable: true } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkYoutubeVideo("abcdefgh_12", "token", "channel")).rejects.toMatchObject({ permanent: true });
  });
  it("never sends credentials to an unexpected upload host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(readUploadProgress("https://attacker.example/", "token", 20)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
