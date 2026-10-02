import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  keyGet: vi.fn(),
  tokenGet: vi.fn(),
  accessToken: vi.fn(),
  findDoc: vi.fn(),
  events: vi.fn(),
  overrides: vi.fn()
}));

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/src/server/youtube-client", () => ({
  youtubeKeyGet: mocks.keyGet,
  youtubeGet: mocks.tokenGet,
  youtubeAccessToken: mocks.accessToken
}));
vi.mock("@/src/lib/prisma", () => ({
  prisma: { teleprompterDoc: { findFirst: mocks.findDoc }, livestreamEvent: { findMany: mocks.events } }
}));
vi.mock("@/src/server/show-schedule", () => ({ loadScheduleOverrides: mocks.overrides }));

import { loadPublicLive, loadPublicShows, loadShowAnnouncements } from "@/src/server/public-feed";

const video = (id: string, title: string, privacy = "public") => ({
  id,
  snippet: { title, publishedAt: "2026-09-25T15:30:00Z", liveBroadcastContent: "none" },
  contentDetails: { duration: "PT10M" },
  status: { privacyStatus: privacy, uploadStatus: "processed" }
});

/** A tiny fake YouTube: two seasons, one private (scheduled) show. */
function fakeYoutube(path: string) {
  if (path.startsWith("playlists?")) {
    return { items: [
      { id: "S31", snippet: { title: "InFocus News | Season 31" } },
      { id: "CAMP", snippet: { title: "Camp MAC 2026" } },
      { id: "S30", snippet: { title: "InFocus News | Season 30" } }
    ] };
  }
  if (path.includes("playlistId=S31")) return { items: [{ contentDetails: { videoId: "fri" } }, { contentDetails: { videoId: "next" } }] };
  if (path.includes("playlistId=S30")) return { items: [{ contentDetails: { videoId: "june" } }] };
  if (path.includes("playlistId=UU")) return { items: [] };
  if (path.startsWith("videos?")) {
    return { items: [
      video("fri", "InFocus News | Friday, September 25th, 2026"),
      video("next", "InFocus News | Wednesday, October 7th, 2026", "private"),
      video("june", "InFocus News | Tuesday, June 2nd, 2026")
    ].filter((item) => path.includes(item.id)) };
  }
  throw new Error(`unexpected ${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("YOUTUBE_CHANNEL_ID", "UCchannel");
  vi.stubEnv("YOUTUBE_API_KEY", "test-key");
  mocks.keyGet.mockImplementation(async (path: string) => fakeYoutube(path));
  mocks.overrides.mockResolvedValue(new Map());
  mocks.events.mockResolvedValue([]);
});

afterEach(() => vi.unstubAllEnvs());

describe("public feed", () => {
  it("reads public data with the API key, never the channel sign-in", async () => {
    const { latest, seasons } = await loadPublicShows(new Date("2026-10-01T12:00:00Z"));
    expect(mocks.accessToken).not.toHaveBeenCalled();
    expect(mocks.keyGet).toHaveBeenCalledWith(expect.stringContaining("channelId=UCchannel"), "test-key");
    expect(seasons.map((season) => [season.number, season.shows.map((show) => show.videoId)])).toEqual([[31, ["fri"]], [30, ["june"]]]);
    expect(latest?.videoId).toBe("fri");
  });

  it("falls back to the channel sign-in without a key", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "");
    mocks.accessToken.mockResolvedValue("oauth-token");
    mocks.tokenGet.mockImplementation(async (path: string) => fakeYoutube(path));
    await loadPublicLive();
    expect(mocks.tokenGet).toHaveBeenCalledWith(expect.stringContaining("playlistId=UUchannel"), "oauth-token");
  });

  it("shares a show's announcements only once that show is public", async () => {
    mocks.findDoc.mockResolvedValue({ sections: [{ content: "CAM 2\n[ANCHOR]\nClub Fair is Thursday.\n\n[INSERT PACKAGE TOSS]" }] });
    expect(await loadShowAnnouncements("2026-10-07")).toBeNull();
    expect(await loadShowAnnouncements("2026-09-25")).toEqual({ showDate: "2026-09-25", announcements: ["Club Fair is Thursday."] });
    expect(mocks.findDoc).toHaveBeenCalledWith(expect.objectContaining({ where: { showDate: new Date("2026-09-25T12:00:00.000Z") } }));
  });
});
