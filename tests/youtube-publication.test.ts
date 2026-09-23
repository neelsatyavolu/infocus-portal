import { describe, expect, it } from "vitest";
import { publicationDateKey, isPublicationDue, youtubeEmbedCode, youtubeWatchUrl } from "@/src/lib/youtube-publication";

describe("YouTube publication rules", () => {
  it("uses the Pacific date across midnight and daylight saving", () => {
    expect(publicationDateKey(new Date("2026-09-20T06:59:00Z"))).toBe("2026-09-19");
    expect(publicationDateKey(new Date("2026-09-20T07:00:00Z"))).toBe("2026-09-20");
    expect(publicationDateKey(new Date("2026-12-20T07:59:00Z"))).toBe("2026-12-19");
  });
  it("waits for the release hour and excludes pre-activation history", () => {
    const now = new Date("2026-09-20T18:59:00Z");
    expect(isPublicationDue("2026-09-20", "2026-09-19", 12, now)).toBe(false);
    expect(isPublicationDue("2026-09-20", "2026-09-19", 11, now)).toBe(true);
    expect(isPublicationDue("2026-09-18", "2026-09-19", 0, now)).toBe(false);
    expect(isPublicationDue("2026-09-19", "2026-09-19", 12, now)).toBe(true);
    expect(isPublicationDue("2026-09-21", "2026-09-19", 0, now)).toBe(false);
  });
  it("produces embeddable HTML and rejects non-video IDs", () => {
    expect(youtubeWatchUrl("abcdefgh_12")).toBe("https://www.youtube.com/watch?v=abcdefgh_12");
    expect(youtubeEmbedCode("abcdefgh_12")).toContain('src="https://www.youtube.com/embed/abcdefgh_12"');
    expect(youtubeEmbedCode("abcdefgh_12")).toContain("allowfullscreen");
    expect(() => youtubeEmbedCode('bad" onload="x')).toThrow();
  });
});
