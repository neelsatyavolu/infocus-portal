import { describe, expect, it } from "vitest";
import {
  classifyStreams,
  durationSeconds,
  isPublicShowVideo,
  mergeUpcoming,
  publicAnnouncements,
  seasonPlaylists,
  showDateFromTitle,
  sortShowsNewestFirst,
  toPublicShow,
  uploadsPlaylistId,
  type YoutubeVideo
} from "@/src/lib/public-feed";

function video(id: string, overrides: Partial<YoutubeVideo> = {}): YoutubeVideo {
  return {
    id,
    snippet: { title: `Video ${id}`, publishedAt: "2026-09-25T15:30:00Z", liveBroadcastContent: "none", thumbnails: {} },
    contentDetails: { duration: "PT12M22S" },
    status: { privacyStatus: "public", uploadStatus: "processed" },
    ...overrides
  };
}

describe("show titles and durations", () => {
  it("reads the air date from both title styles", () => {
    expect(showDateFromTitle("InFocus News | Friday, September 25th, 2026")).toBe("2026-09-25");
    expect(showDateFromTitle("InFocusNews | Wednesday, September 23, 2026")).toBe("2026-09-23");
    expect(showDateFromTitle("InFocus News | Tuesday, June 2nd 2026")).toBe("2026-06-02");
    expect(showDateFromTitle("Puppy Yoga")).toBeNull();
    expect(showDateFromTitle("InFocus News | February 30th, 2026")).toBeNull();
  });

  it("turns ISO 8601 durations into seconds", () => {
    expect(durationSeconds("PT12M22S")).toBe(742);
    expect(durationSeconds("PT1H2M3S")).toBe(3723);
    expect(durationSeconds("P0D")).toBeNull();
    expect(durationSeconds(undefined)).toBeNull();
    expect(durationSeconds("12:22")).toBeNull();
  });
});

describe("shows", () => {
  it("keeps only public, processed, already-released uploads", () => {
    expect(isPublicShowVideo(video("a"))).toBe(true);
    expect(isPublicShowVideo(video("b", { status: { privacyStatus: "private", uploadStatus: "processed" } }))).toBe(false);
    expect(isPublicShowVideo(video("c", { status: { privacyStatus: "unlisted", uploadStatus: "processed" } }))).toBe(false);
    expect(isPublicShowVideo(video("d", { status: { privacyStatus: "public", uploadStatus: "uploaded" } }))).toBe(false);
  });

  it("maps a video to a show with the best thumbnail", () => {
    const show = toPublicShow(video("abc", {
      snippet: {
        title: "InFocus News | Friday, September 25th, 2026",
        publishedAt: "2026-09-25T15:30:00Z",
        thumbnails: { high: { url: "https://i.ytimg.com/high.jpg" }, maxres: { url: "https://i.ytimg.com/max.jpg" } }
      }
    }));
    expect(show).toEqual({
      videoId: "abc",
      title: "InFocus News | Friday, September 25th, 2026",
      showDate: "2026-09-25",
      publishedAt: "2026-09-25T15:30:00Z",
      thumbnailUrl: "https://i.ytimg.com/max.jpg",
      durationSeconds: 742
    });
    expect(toPublicShow(video("xyz")).thumbnailUrl).toBe("https://i.ytimg.com/vi/xyz/hqdefault.jpg");
  });

  it("sorts newest air date first", () => {
    const shows = ["2026-09-18", "2026-09-25", "2026-09-23"].map((date) => ({
      ...toPublicShow(video(date)),
      showDate: date
    }));
    expect(sortShowsNewestFirst(shows).map((show) => show.showDate)).toEqual(["2026-09-25", "2026-09-23", "2026-09-18"]);
  });

  it("finds season playlists, newest first", () => {
    expect(seasonPlaylists([
      { id: "p30", title: "InFocus News | Season 30" },
      { id: "camp", title: "Camp MAC 2026" },
      { id: "p31", title: "InFocus News | Season 31" }
    ])).toEqual([
      { number: 31, title: "InFocus News | Season 31", playlistId: "p31" },
      { number: 30, title: "InFocus News | Season 30", playlistId: "p30" }
    ]);
  });

  it("derives the uploads playlist from the channel", () => {
    expect(uploadsPlaylistId("UCabc123")).toBe("UUabc123");
    expect(uploadsPlaylistId("bad")).toBeNull();
  });

  it("drops announcement lines that still hold placeholders", () => {
    expect(publicAnnouncements(["Club Fair is Thursday.", "[INSERT PACKAGE TOSS]", "Fill {name} here", "Blood drive Friday."]))
      .toEqual(["Club Fair is Thursday.", "Blood drive Friday."]);
  });
});

describe("livestreams", () => {
  const stream = (id: string, broadcast: string, details: NonNullable<YoutubeVideo["liveStreamingDetails"]>, privacy = "public") =>
    video(id, {
      snippet: { title: id, liveBroadcastContent: broadcast },
      status: { privacyStatus: privacy, uploadStatus: "uploaded" },
      liveStreamingDetails: details
    });

  it("sorts public streams into live, scheduled and ended", () => {
    const { live, scheduled, recent } = classifyStreams([
      stream("now", "live", { actualStartTime: "2026-10-02T18:00:00Z" }),
      stream("soon", "upcoming", { scheduledStartTime: "2026-10-03T01:00:00Z" }),
      stream("old", "none", { actualStartTime: "2026-09-01T18:00:00Z", actualEndTime: "2026-09-01T20:00:00Z" }),
      stream("older", "none", { actualStartTime: "2026-08-01T18:00:00Z", actualEndTime: "2026-08-01T20:00:00Z" }),
      stream("hidden", "live", { actualStartTime: "2026-10-02T18:00:00Z" }, "unlisted"),
      video("upload")
    ]);
    expect(live.map((item) => item.videoId)).toEqual(["now"]);
    expect(scheduled).toEqual([{ videoId: "soon", title: "soon", startsAt: "2026-10-03T01:00:00Z" }]);
    expect(recent.map((item) => item.videoId)).toEqual(["old", "older"]);
  });

  it("joins a calendar event to the YouTube stream scheduled near it", () => {
    const upcoming = mergeUpcoming(
      [
        { id: "e1", title: "Varsity Football", startsAt: new Date("2026-10-03T00:30:00Z"), location: "Stadium " },
        { id: "e2", title: "Fall Concert", startsAt: new Date("2026-10-10T02:00:00Z"), location: "" }
      ],
      [
        { videoId: "yt1", title: "Football stream", startsAt: "2026-10-03T01:00:00Z" },
        { videoId: "yt2", title: "Water Polo", startsAt: "2026-10-05T01:00:00Z" }
      ]
    );
    expect(upcoming).toEqual([
      { id: "e1", title: "Varsity Football", startsAt: "2026-10-03T00:30:00.000Z", location: "Stadium", videoId: "yt1" },
      { id: "yt2", title: "Water Polo", startsAt: "2026-10-05T01:00:00Z", location: null, videoId: "yt2" },
      { id: "e2", title: "Fall Concert", startsAt: "2026-10-10T02:00:00.000Z", location: null, videoId: null }
    ]);
  });
});
