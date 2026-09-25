import { describe, expect, it } from "vitest";
import { finalCutHeadline, HEADLINE_MAX_LENGTH, headlineError } from "@/src/lib/package-headline";

const nasPath = (file: string) => `Package Storage/Cycle 1/Airport - Abby Otto/Final Cut/${file}`;

describe("headlineError", () => {
  it("accepts a normal headline", () => {
    expect(headlineError("Palo Alto Airport Day brings the community together")).toBeNull();
  });

  it("requires a headline", () => {
    expect(headlineError("   ")).toMatch(/headline/i);
  });

  it("keeps headlines within YouTube's title limit", () => {
    expect(headlineError("a".repeat(HEADLINE_MAX_LENGTH))).toBeNull();
    expect(headlineError("a".repeat(HEADLINE_MAX_LENGTH + 1))).toMatch(/100/);
  });

  it("rejects angle brackets, which YouTube titles cannot contain", () => {
    expect(headlineError("Airport <Day>")).toMatch(/< or >/);
  });
});

describe("finalCutHeadline", () => {
  it("uses the Final Cut title when a headline was typed", () => {
    expect(
      finalCutHeadline({
        title: "Palo Alto Airport Day brings the community together",
        currentVersion: { nasPath: nasPath("airport final v3.mp4") }
      })
    ).toBe("Palo Alto Airport Day brings the community together");
  });

  it("ignores older Final Cuts titled with the uploaded file name", () => {
    expect(
      finalCutHeadline({ title: "airport final v3", currentVersion: { nasPath: nasPath("airport final v3.mp4") } })
    ).toBeNull();
    expect(
      finalCutHeadline({ title: "Airport: final?", currentVersion: { nasPath: nasPath("Airport- final-.mov") } })
    ).toBeNull();
    expect(finalCutHeadline({ title: "Final Cut", currentVersion: { nasPath: nasPath("Final Cut.mp4") } })).toBeNull();
    // A later version added from the media library gets a -vN file suffix but keeps the title.
    expect(
      finalCutHeadline({ title: "airport final", currentVersion: { nasPath: nasPath("airport final-v2.mp4") } })
    ).toBeNull();
  });

  it("ignores Final Cuts without a Drive file or media", () => {
    expect(finalCutHeadline({ title: "Legacy upload", currentVersion: { nasPath: null } })).toBeNull();
    expect(finalCutHeadline({ title: "Legacy upload", currentVersion: null })).toBeNull();
    expect(finalCutHeadline(null)).toBeNull();
  });
});
