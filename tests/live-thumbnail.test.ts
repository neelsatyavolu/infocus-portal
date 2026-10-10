import { describe, expect, it } from "vitest";
import { applyScoreboardAction, defaultScoreboard } from "@/src/lib/live/scoreboard";
import {
  finalScoreInputs,
  fitFontSize,
  fitWrappedFontSize,
  formatThumbnailDate,
  formatThumbnailTime,
  pacificDateTimeInputs,
  parseEventTitle,
  thumbnailFileName,
  thumbnailQuerySchema
} from "@/src/lib/live/thumbnail";

describe("live thumbnail helpers", () => {
  it("reads teams out of tracker titles", () => {
    expect(parseEventTitle("Varsity Boys Basketball vs. Gunn")).toEqual({
      isMatchup: true,
      home: "Paly",
      away: "Gunn",
      line: "Varsity Boys Basketball"
    });
    expect(parseEventTitle("Paly vs Los Altos")).toMatchObject({ home: "Paly", away: "Los Altos", line: "" });
    expect(parseEventTitle("Homecoming Rally")).toMatchObject({ isMatchup: false });
  });

  it("converts the event time to Pacific date and time inputs", () => {
    expect(pacificDateTimeInputs("2026-10-03T02:00:00.000Z")).toEqual({ date: "2026-10-02", time: "19:00" });
  });

  it("formats dates and times for the graphic", () => {
    expect(formatThumbnailTime("19:00")).toBe("7:00 PM");
    expect(formatThumbnailTime("00:30")).toBe("12:30 AM");
    expect(formatThumbnailDate("2026-10-02")).toEqual({ short: "Fri", long: "Friday", monthDay: "Oct 2" });
  });

  it("shrinks text to fit", () => {
    expect(fitFontSize("Gunn", 936, 210, 90)).toBe(210);
    expect(fitFontSize("Sacred Heart Prep", 936, 210, 90)).toBeLessThan(100);
    expect(fitWrappedFontSize("Homecoming Rally", 700, 3, 116, 56)).toBeLessThanOrEqual(112);
    expect(fitWrappedFontSize("Homecoming", 700, 3, 116, 56)).toBeLessThan(116);
  });

  it("validates query params with defaults", () => {
    expect(thumbnailQuerySchema.parse({})).toMatchObject({ template: "matchup", format: "youtube", home: "Paly" });
    expect(() => thumbnailQuerySchema.parse({ format: "tiktok" })).toThrow();
    expect(() => thumbnailQuerySchema.parse({ date: "10/02/2026" })).toThrow();
  });

  it("reads final scores from the query", () => {
    expect(thumbnailQuerySchema.parse({ template: "final" })).toMatchObject({ homeScore: 0, awayScore: 0 });
    expect(thumbnailQuerySchema.parse({ template: "final", homeScore: "56", awayScore: "48" })).toMatchObject({
      template: "final",
      homeScore: 56,
      awayScore: 48
    });
    expect(() => thumbnailQuerySchema.parse({ homeScore: "-1" })).toThrow();
    expect(() => thumbnailQuerySchema.parse({ homeScore: "1000" })).toThrow();
    expect(() => thumbnailQuerySchema.parse({ awayScore: "5.5" })).toThrow();
    expect(() => thumbnailQuerySchema.parse({ awayScore: "lots" })).toThrow();
  });

  it("starts a final thumbnail from the scoreboard", () => {
    const basketball = applyScoreboardAction(defaultScoreboard("basketball"), { type: "scoreSet", team: 0, score: 56 }, 0);
    expect(finalScoreInputs(applyScoreboardAction(basketball, { type: "scoreSet", team: 1, score: 48 }, 0))).toEqual({
      homeScore: "56",
      awayScore: "48"
    });

    const volleyball = defaultScoreboard("volleyball");
    const [home, away] = volleyball.teams;
    expect(
      finalScoreInputs({ ...volleyball, teams: [{ ...home, score: 25, sets: 3 }, { ...away, score: 19, sets: 1 }] })
    ).toEqual({ homeScore: "3", awayScore: "1" });
  });

  it("names downloads after the event", () => {
    expect(thumbnailFileName({ template: "matchup", format: "post", home: "Paly", away: "Gunn", title: "", date: "2026-10-02" })).toBe(
      "paly-vs-gunn-2026-10-02-post.png"
    );
    expect(thumbnailFileName({ template: "event", format: "youtube", home: "", away: "", title: "Homecoming Rally!", date: undefined })).toBe(
      "homecoming-rally-youtube.png"
    );
    expect(thumbnailFileName({ template: "final", format: "youtube", home: "Paly", away: "Gunn", title: "", date: "2026-10-02" })).toBe(
      "paly-vs-gunn-final-2026-10-02-youtube.png"
    );
  });
});
