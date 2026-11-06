import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ token: vi.fn(), get: vi.fn() }));

vi.mock("@/src/server/youtube-client", () => ({ youtubeAccessToken: mocks.token, youtubeGet: mocks.get }));

import { showCopyOnYoutube } from "@/src/server/show-youtube-copy";

const SHOW = "2026-11-05";

function uploads(...ids: string[]) {
  return { items: ids.map((videoId) => ({ contentDetails: { videoId } })) };
}

describe("showCopyOnYoutube", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("YOUTUBE_CHANNEL_ID", "UCabc123");
    mocks.token.mockResolvedValue("token");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reads the channel's uploads playlist with its own sign-in and finds the show by title", async () => {
    mocks.get
      .mockResolvedValueOnce(uploads("pkg", "show"))
      .mockResolvedValueOnce({ items: [
        { id: "pkg", snippet: { title: "Homecoming spirit week" }, status: { uploadStatus: "processed" } },
        { id: "show", snippet: { title: "InFocus News | Thursday, November 5th, 2026" }, status: { uploadStatus: "uploaded" } }
      ] });
    expect(await showCopyOnYoutube(SHOW)).toBe(true);
    expect(mocks.get.mock.calls[0]).toEqual([expect.stringContaining("playlistId=UUabc123"), "token"]);
    expect(mocks.get.mock.calls[1]).toEqual([expect.stringContaining("id=pkg,show"), "token"]);
  });

  it("says no when no upload is this show", async () => {
    mocks.get
      .mockResolvedValueOnce(uploads("old"))
      .mockResolvedValueOnce({ items: [{ id: "old", snippet: { title: "InFocus News | Wednesday, November 4th, 2026" }, status: {} }] });
    expect(await showCopyOnYoutube(SHOW)).toBe(false);
  });

  it("says no (and goes ahead) when YouTube can't be asked or isn't set up", async () => {
    mocks.token.mockRejectedValue(new Error("YouTube isn't connected."));
    expect(await showCopyOnYoutube(SHOW)).toBe(false);
    vi.stubEnv("YOUTUBE_CHANNEL_ID", "");
    expect(await showCopyOnYoutube(SHOW)).toBe(false);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
