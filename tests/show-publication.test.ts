import { describe, expect, it } from "vitest";
import {
  chooseSeason,
  ordinalDay,
  parseSeasonNumber,
  seasonPlaylistTitle,
  fullAnchorNames,
  showDescription,
  showPublishAt,
  showTitle,
  tossStory
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
  it("credits the anchors, then each package as its toss's story with the reporters' full names", () => {
    expect(showDescription({
      anchors: ["Abby Ames", "Otto Ortiz"],
      packages: [{
        reporters: ["Sage Smith", "Rio Reyes", "Lee Lin"],
        toss: "Last year, a class field trip led to a lawsuit. InFocus reporters Sage, Rio, and Lee have more."
      }]
    })).toBe(
      "Anchors Abby Ames and Otto Ortiz share campus announcements. " +
      "Last year, a class field trip led to a lawsuit. Reported by Sage Smith, Rio Reyes, and Lee Lin."
    );
  });

  it("keeps story sentences that merely mention reporters, and drops a 'has more' hand-off", () => {
    expect(showDescription({ anchors: [], packages: [{
      reporters: ["Sage Smith"], toss: "Reporters were turned away at the meeting. Sage has more."
    }] })).toBe("Reporters were turned away at the meeting. Reported by Sage Smith.");
  });

  it("credits a package with no toss in one line, and handles one anchor and missing pieces", () => {
    expect(showDescription({ anchors: ["Abby Ames"], packages: [{ reporters: ["Sage Smith"], toss: null }] }))
      .toBe("Anchor Abby Ames shares campus announcements. InFocus reporter Sage Smith shares a story.");
    expect(showDescription({ anchors: [], packages: [] })).toBe("");
    expect(showDescription({ anchors: ["", "Otto Ortiz"], packages: [{ reporters: [], toss: "  " }] }))
      .toBe("Anchor Otto Ortiz shares campus announcements.");
  });
});

describe("tossStory", () => {
  it("keeps the story and drops only the hand-off sentence", () => {
    expect(tossStory("A field trip sparked a lawsuit. InFocus reporter Sage Smith has more.")).toBe("A field trip sparked a lawsuit.");
    expect(tossStory("No hand-off here")).toBe("No hand-off here");
  });
});

describe("fullAnchorNames", () => {
  const users = [
    { name: "Sage Smith", nickname: null },
    { name: "Edward Jones", nickname: "EJ" },
    { name: "Rio Reyes", nickname: null },
    { name: "Rio Lopez", nickname: null },
    { name: null, nickname: "Ghost" }
  ];

  it("turns a first name or nickname into the one matching full name, any case", () => {
    expect(fullAnchorNames(["sage", "EJ"], users)).toEqual(["Sage Smith", "Edward Jones"]);
  });

  it("leaves a name alone when nobody or several people match, or it's already a full name", () => {
    expect(fullAnchorNames(["Rio", "Nobody", "Ghost", "Abby Ames"], users)).toEqual(["Rio", "Nobody", "Ghost", "Abby Ames"]);
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
