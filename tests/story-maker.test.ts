import { describe, expect, it } from "vitest";
import { thumbnailQuerySchema } from "@/src/lib/live/thumbnail";
import {
  apDate,
  defaultLivestreamFields,
  downscaledSize,
  fitScale,
  livestreamThumbnailQuery,
  splitPoints,
  storyFileName
} from "@/src/lib/story-maker";

describe("livestreamThumbnailQuery", () => {
  const fields = defaultLivestreamFields(new Date(2026, 9, 3));
  const parse = (query: string) => thumbnailQuerySchema.parse(Object.fromEntries(new URLSearchParams(query)));

  it("asks the thumbnail API for a story-format matchup", () => {
    expect(parse(livestreamThumbnailQuery(fields))).toMatchObject({
      template: "matchup",
      format: "story",
      home: "Paly",
      away: "Gunn",
      line: "Varsity Football",
      date: "2026-10-03",
      time: "19:00"
    });
  });

  it("sends only the event title for events", () => {
    const query = new URLSearchParams(livestreamThumbnailQuery({ ...fields, template: "event", title: " Senior Night " }));
    expect(query.get("title")).toBe("Senior Night");
    expect(query.has("home")).toBe(false);
    expect(query.has("away")).toBe(false);
  });

  it("leaves out empty fields so the API defaults apply", () => {
    const query = new URLSearchParams(livestreamThumbnailQuery({ ...fields, location: "  ", time: "" }));
    expect(query.has("location")).toBe(false);
    expect(query.has("time")).toBe(false);
  });
});

describe("apDate", () => {
  it("abbreviates months the AP way", () => {
    expect(apDate(new Date(2026, 8, 26))).toBe("Sept. 26, 2026");
    expect(apDate(new Date(2026, 0, 5))).toBe("Jan. 5, 2026");
  });

  it("spells out short months", () => {
    expect(apDate(new Date(2026, 2, 1))).toBe("March 1, 2026");
    expect(apDate(new Date(2026, 6, 4))).toBe("July 4, 2026");
  });
});

describe("splitPoints", () => {
  it("keeps non-empty trimmed lines, up to five", () => {
    expect(splitPoints(" one \n\ntwo\nthree\nfour\nfive\nsix")).toEqual(["one", "two", "three", "four", "five"]);
  });

  it("returns nothing for blank text", () => {
    expect(splitPoints("  \n ")).toEqual([]);
  });
});

describe("downscaledSize", () => {
  it("shrinks the long side to the limit and keeps the aspect ratio", () => {
    expect(downscaledSize(4800, 3200, 2400)).toEqual({ width: 2400, height: 1600 });
    expect(downscaledSize(3000, 6000, 2400)).toEqual({ width: 1200, height: 2400 });
  });

  it("never upscales", () => {
    expect(downscaledSize(1200, 800, 2400)).toEqual({ width: 1200, height: 800 });
  });
});

describe("fitScale", () => {
  // Content height grows linearly with the scale: 1000px at full size.
  const heightAt = (full: number) => (scale: number) => full * scale;

  it("keeps full size when the content fits", () => {
    expect(fitScale(heightAt(800), 900)).toEqual({ scale: 1, overflow: false });
  });

  it("shrinks until the content fits", () => {
    const result = fitScale(heightAt(1000), 900);
    expect(result.overflow).toBe(false);
    expect(result.scale).toBeLessThan(1);
    expect(1000 * result.scale).toBeLessThanOrEqual(901);
  });

  it("stops at 75% and reports overflow when it still doesn't fit", () => {
    expect(fitScale(heightAt(2000), 900)).toEqual({ scale: 0.75, overflow: true });
  });
});

describe("storyFileName", () => {
  it("names the file after the template and the local date", () => {
    expect(storyFileName("cover", new Date(2026, 8, 26, 23, 30))).toBe("infocus-story-cover-2026-09-26.png");
  });
});
