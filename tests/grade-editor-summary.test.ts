import { describe, expect, it } from "vitest";
import { cycleCheckInSummary, editorWeightedPercentage, packageSubtotal } from "@/src/lib/grade-editor-summary";

describe("cycleCheckInSummary", () => {
  it("sums released numeric check-ins and counts 5 possible for each", () => {
    expect(
      cycleCheckInSummary({ pitching: 5, proofOfContact: 0, aRollBRoll: 3, initialCut: 5 })
    ).toEqual({ earned: 13, possible: 20, released: 4 });
  });

  it("skips stages that are not released yet", () => {
    expect(
      cycleCheckInSummary({ pitching: 5, proofOfContact: 5, aRollBRoll: null, initialCut: null })
    ).toEqual({ earned: 10, possible: 10, released: 2 });
  });

  it("excludes ungraded and exempt stages from earned and possible", () => {
    expect(
      cycleCheckInSummary({ pitching: "EXEMPT", proofOfContact: "UNGRADED", aRollBRoll: 5, initialCut: 0 })
    ).toEqual({ earned: 5, possible: 10, released: 4 });
  });

  it("reports nothing released when every stage is pending", () => {
    expect(
      cycleCheckInSummary({ pitching: null, proofOfContact: null, aRollBRoll: null, initialCut: null })
    ).toEqual({ earned: 0, possible: 0, released: 0 });
  });
});

describe("packageSubtotal", () => {
  const entries = [
    { cycleNumber: 1, totalPoints: 42, finalCutState: null },
    { cycleNumber: 2, totalPoints: null, finalCutState: null },
    { cycleNumber: 3, totalPoints: null, finalCutState: "EXEMPT" as const }
  ];

  it("counts official cycle scores and ignores cycles with no score", () => {
    expect(packageSubtotal(entries, {}, 50)).toEqual({ earned: 42, possible: 50 });
  });

  it("counts a typed override for a cycle without an official score", () => {
    expect(packageSubtotal(entries, { 2: "30" }, 50)).toEqual({ earned: 72, possible: 100 });
  });

  it("ignores dash and backslash overrides and clamps numbers to the max", () => {
    expect(packageSubtotal(entries, { 2: "-", 3: "\\" }, 50)).toEqual({ earned: 42, possible: 50 });
    expect(packageSubtotal(entries, { 2: "99" }, 50)).toEqual({ earned: 92, possible: 100 });
  });
});

describe("editorWeightedPercentage", () => {
  it("weights packages 55 / participation 35 like the student gradebook, not raw points", () => {
    // A missed Final Cut (0/50), 50/60 check-ins due so far, near-perfect participation.
    const percent = editorWeightedPercentage({
      finalCuts: { earned: 0, possible: 50 },
      checkIns: { earned: 50, possible: 60 },
      livestream: null,
      participation: { earned: 369, possible: 370 },
      final: null,
      extra: null
    });
    expect(percent).toBe(66.6);
  });

  it("is null when nothing is gradeable", () => {
    expect(
      editorWeightedPercentage({
        finalCuts: { earned: 0, possible: 0 },
        checkIns: null,
        livestream: null,
        participation: { earned: 0, possible: 0 },
        final: null,
        extra: null
      })
    ).toBeNull();
  });
});
