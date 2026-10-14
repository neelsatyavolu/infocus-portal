import { afterEach, describe, expect, it, vi } from "vitest";
import { readUploadProgress, uploadYoutubeChunk, streamYoutubeChunk, checkYoutubeVideo, PublicationError } from "@/src/server/youtube-client";

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
  it("streams one large range from Drive to YouTube with its exact length", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("0123456789", { status: 206, headers: { "Content-Range": "bytes 8-17/40" } }))
      .mockResolvedValueOnce(new Response(null, { status: 308, headers: { Range: "bytes=0-17" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await streamYoutubeChunk({ sourceUrl: "https://drive.example/video", sessionUrl: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=x", token: "token", size: 40, offset: 8, chunkBytes: 10, timeoutMs: 1000 });
    expect(result).toEqual({ offset: 18 });
    expect(fetchMock.mock.calls[0][1].headers.Range).toBe("bytes=8-17");
    const put = fetchMock.mock.calls[1][1];
    expect(put.headers).toMatchObject({ "Content-Length": "10", "Content-Range": "bytes 8-17/40" });
    expect(put.body).toBeInstanceOf(ReadableStream);
  });
  it("refuses to stream when Drive ignores the range", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("huge video", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(streamYoutubeChunk({ sourceUrl: "https://drive.example/video", sessionUrl: "https://www.googleapis.com/upload/youtube/v3/videos", token: "token", size: 40, offset: 8, chunkBytes: 10, timeoutMs: 1000 })).rejects.toBeInstanceOf(PublicationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
