import { describe, expect, it } from "vitest";
import { chapterLines, chaptersOf, chapterTime, youtubeChapters } from "@/src/lib/show-chapters";
import { SHOW_HASHTAGS, showDescription } from "@/src/lib/show-publication";

const chapters = [
  { title: "Intro", start: 0 }, { title: "Welcome", start: 11.2 }, { title: "Karaoke Club", start: 30.5 },
  { title: "Breaking Down Walls", start: 36 }, { title: "Package: Field trip lawsuit", start: 80 }, { title: "Outro", start: 262 }
];

describe("chapters", () => {
  it("cleans the editor's chapters: titles and numbers only, in order, the first at 0", () => {
    expect(chaptersOf({ chapters: [{ title: " Welcome ", start: 12 }, { title: "Intro", start: 0.4 }, { title: 5, start: 3 }, { title: "x", start: -1 }] }))
      .toEqual([{ title: "Intro", start: 0 }, { title: "Welcome", start: 12 }]);
    expect(chaptersOf(null)).toEqual([]);
  });

  it("formats times like YouTube", () => {
    expect([0, 75.4, 3723].map(chapterTime)).toEqual(["0:00", "1:15", "1:02:03"]);
  });

  it("folds chapters under 10 s into the one before, and needs at least 3 for YouTube", () => {
    expect(youtubeChapters(chapters).map((chapter) => chapter.title)).toEqual(["Intro", "Welcome", "Karaoke Club", "Package: Field trip lawsuit", "Outro"]);
    expect(youtubeChapters(chapters.slice(0, 2))).toEqual([]);
  });

  it("puts the chapters and hashtags in the YouTube description", () => {
    const text = showDescription({ anchors: ["Abby Ames"], packages: [], chapters });
    expect(text).toBe([
      "Anchor Abby Ames shares campus announcements.",
      chapterLines(chapters),
      SHOW_HASHTAGS.join(" ")
    ].join("\n\n"));
    expect(text).toContain("0:00 Intro\n0:11 Welcome\n0:30 Karaoke Club\n1:20 Package: Field trip lawsuit\n4:22 Outro");
  });
});
