import { describe, expect, it } from "vitest";
import {
  cycleGradesArePublished,
  MAX_CYCLE_GRADE_FEEDBACK,
  normalizeCycleGradeFeedback,
  sharedGradeFeedback
} from "@/src/lib/package-cycle-grades";

describe("shared cycle grade feedback", () => {
  it("returns the first non-empty producer note", () => {
    expect(
      sharedGradeFeedback([
        { feedback: "   " },
        { feedback: "Tighten the standup." },
        { feedback: "Different note" }
      ])
    ).toBe("Tighten the standup.");
  });

  it("returns empty when nobody has written feedback", () => {
    expect(sharedGradeFeedback([{ feedback: "" }, { feedback: "  " }])).toBe("");
    expect(sharedGradeFeedback([])).toBe("");
  });

  it("trims and caps saved feedback", () => {
    expect(normalizeCycleGradeFeedback("  Strong package.  ")).toBe("Strong package.");
    expect(normalizeCycleGradeFeedback("x".repeat(MAX_CYCLE_GRADE_FEEDBACK + 20))).toHaveLength(
      MAX_CYCLE_GRADE_FEEDBACK
    );
  });
});

describe("cycle grade publish status", () => {
  it("is unpublished until every member has publishedAt", () => {
    const grades = [
      { userId: "a", publishedAt: new Date("2026-08-15T00:00:00.000Z") },
      { userId: "b", publishedAt: null }
    ];
    expect(cycleGradesArePublished(grades, ["a", "b"])).toBe(false);
    expect(cycleGradesArePublished([{ ...grades[0], publishedAt: new Date() }, { ...grades[1], publishedAt: new Date() }], ["a", "b"])).toBe(
      true
    );
  });

  it("is unpublished when a member has no grade row yet", () => {
    expect(cycleGradesArePublished([{ userId: "a", publishedAt: new Date() }], ["a", "b"])).toBe(false);
    expect(cycleGradesArePublished([], ["a"])).toBe(false);
    expect(cycleGradesArePublished([], [])).toBe(false);
  });
});
