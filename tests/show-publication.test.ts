import { describe, expect, it } from "vitest";
import {
  chooseSeason,
  ordinalDay,
  parseSeasonNumber,
  seasonPlaylistTitle,
  showDescription,
  showPublishAt,
  showTitle
} from "@/src/lib/show-publication";

describe("showTitle", () => {
  it("formats the show date with an ordinal day", () => {
    expect(showTitle("2026-09-22")).toBe("InFocus News | Tuesday, September 22nd, 2026");
    expect(showTitle("2026-10-01")).toBe("InFocus News | Thursday, October 1st, 2026");
  });

  it("uses th for 11-13 and other days", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 24, 31].map(ordinalDay)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "24th", "31st"
    ]);
  });
});

describe("showPublishAt", () => {
  it("converts Pacific wall time to UTC during daylight time", () => {
    expect(showPublishAt("2026-09-22", "08:30").toISOString()).toBe("2026-09-22T15:30:00.000Z");
  });

  it("converts Pacific wall time to UTC during standard time", () => {
    expect(showPublishAt("2026-12-08", "08:30").toISOString()).toBe("2026-12-08T16:30:00.000Z");
  });
});

describe("showDescription", () => {
  it("credits anchors and reporters", () => {
    expect(showDescription({
      anchors: ["Abby Ames", "Otto Ortiz"],
      reporters: ["Sage Smith", "Rio Reyes", "Lee Lin"],
      topics: "school board decisions"
    })).toBe(
      "Anchors Abby Ames and Otto Ortiz share campus announcements. " +
      "InFocus reporters Sage Smith, Rio Reyes, and Lee Lin share news of school board decisions."
    );
  });

  it("handles one anchor, one reporter, and missing pieces", () => {
    expect(showDescription({ anchors: ["Abby Ames"], reporters: ["Sage Smith"], topics: "" }))
      .toBe("Anchor Abby Ames shares campus announcements. InFocus reporter Sage Smith shares the news.");
    expect(showDescription({ anchors: [], reporters: [], topics: "" })).toBe("");
    expect(showDescription({ anchors: ["", "Otto Ortiz"], reporters: [], topics: "x" }))
      .toBe("Anchor Otto Ortiz shares campus announcements.");
  });
});

describe("season playlists", () => {
  it("parses only exact season titles", () => {
    expect(parseSeasonNumber("InFocus News | Season 31")).toBe(31);
    expect(parseSeasonNumber("InFocus News | Season 31 extras")).toBeNull();
    expect(parseSeasonNumber("Season 31")).toBeNull();
    expect(seasonPlaylistTitle(32)).toBe("InFocus News | Season 32");
  });

  it("keeps the highest season when there is no earlier show upload", () => {
    expect(chooseSeason({ highestSeason: 31, latest: null, semesterLabel: "2026-27 S1" }))
      .toEqual({ seasonNumber: 31, create: false });
  });

  it("keeps the season within the same semester", () => {
    expect(chooseSeason({
      highestSeason: 31,
      latest: { seasonNumber: 31, semesterLabel: "2026-27 S1" },
      semesterLabel: "2026-27 S1"
    })).toEqual({ seasonNumber: 31, create: false });
  });

  it("starts a new season in a new semester", () => {
    expect(chooseSeason({
      highestSeason: 31,
      latest: { seasonNumber: 31, semesterLabel: "2026-27 S1" },
      semesterLabel: "2026-27 S2"
    })).toEqual({ seasonNumber: 32, create: true });
  });

  it("does not create twice when the new season already exists", () => {
    expect(chooseSeason({
      highestSeason: 32,
      latest: { seasonNumber: 31, semesterLabel: "2026-27 S1" },
      semesterLabel: "2026-27 S2"
    })).toEqual({ seasonNumber: 32, create: false });
  });

  it("creates season 1 on an empty channel", () => {
    expect(chooseSeason({ highestSeason: null, latest: null, semesterLabel: "2026-27 S1" }))
      .toEqual({ seasonNumber: 1, create: true });
  });
});
