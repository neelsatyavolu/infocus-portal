import { describe, expect, it } from "vitest";
import {
  cycleSeenKey,
  gradesSeenItems,
  isSeenMap,
  LIVESTREAM_SEEN_KEY,
  PORTFOLIO_SEEN_KEY,
  seenChanges,
  seenMapOf,
  seenSummary,
  weekSeenKey,
  type SeenItem
} from "@/components/grades/grades-seen";
import type { EstimatedPayload, GradesMePayload, GradeTile } from "@/components/grades/grades-types";
import { GRADE_WEIGHTS } from "@/src/lib/grading";
import type { GradebookWeek } from "@/src/lib/student-gradebook";

function cycle(cycleNumber: number, overrides: Partial<GradeTile> = {}): GradeTile {
  return {
    cycleNumber,
    focus: "",
    published: false,
    effortPoints: null,
    teamworkPoints: null,
    previousEffortPoints: null,
    previousTeamworkPoints: null,
    totalPoints: null,
    percentage: null,
    revised: false,
    revisedAt: null,
    feedback: null,
    reviewProjectId: null,
    reviewMediaId: null,
    ...overrides
  };
}

function week(weekStart: string, overrides: Partial<GradebookWeek> = {}): GradebookWeek {
  return { weekStart, label: weekStart, earned: 0, possible: 0, fullPossible: 50, graded: false, days: [], ...overrides };
}

function payload({
  cycles = [],
  finalCuts = [],
  checkIns = [],
  weeks = [],
  livestream = null,
  portfolio = null,
  portfolioFeedback = ""
}: {
  cycles?: GradeTile[];
  finalCuts?: Array<number | null>;
  checkIns?: Array<number | null>;
  weeks?: GradebookWeek[];
  livestream?: number | null;
  portfolio?: number | null;
  portfolioFeedback?: string;
}): GradesMePayload {
  const estimated: EstimatedPayload = {
    percentage: null,
    letter: null,
    weights: GRADE_WEIGHTS,
    packages: { earned: 0, possible: 0, finalCutPoints: finalCuts, checkInPoints: checkIns, livestreamPoints: livestream },
    participation: { earned: 0, possible: 0 },
    portfolio: { earned: 0, possible: 0, points: portfolio, max: 100 }
  };
  return {
    role: "ASSOCIATE_PRODUCER",
    isAdmin: false,
    summary: { publishedCycleCount: 0, averageTotal: null, averagePercentage: null, extensionsRemaining: null },
    estimated,
    cycles,
    gradebook: {
      semester: { label: "26-27 S1", start: "2026-08-17", end: "2026-12-18" },
      weeks,
      livestreamHours: 0,
      requiredLivestreamHours: 8,
      portfolioFeedback,
      checkIns: []
    }
  };
}

function labelsFor(previous: GradesMePayload, next: GradesMePayload) {
  return seenChanges(seenMapOf(gradesSeenItems(previous)), gradesSeenItems(next)).map((change) => change.label);
}

describe("grades what's-new items", () => {
  it("skips cycles with nothing visible yet", () => {
    const items = gradesSeenItems(payload({ cycles: [cycle(1), cycle(2)], finalCuts: [null, null], checkIns: [null, null] }));
    expect(items).toEqual([]);
  });

  it("includes an in-progress cycle once check-in points post, indexed by position in all cycles", () => {
    // Cycles arrive unsorted; the estimated arrays follow the sorted order.
    const items = gradesSeenItems(payload({ cycles: [cycle(2), cycle(1)], finalCuts: [null, null], checkIns: [null, 15] }));
    expect(items.map((item) => item.key)).toEqual([cycleSeenKey(2)]);
    expect(items[0].addedLabel).toBe("Cycle 2 scores posted");
  });

  it("never stores producer feedback text, only a fingerprint", () => {
    const secret = "Great framing on the interview";
    const items = gradesSeenItems(payload({ cycles: [cycle(1, { published: true, feedback: secret })], finalCuts: [40], checkIns: [20] }));
    expect(items[0].signature).not.toContain(secret);
    expect(items[0].signature.startsWith("1|")).toBe(true);
  });

  it("lists graded weeks latest first, plus livestream and portfolio once they have something", () => {
    const items = gradesSeenItems(
      payload({
        weeks: [week("2026-10-05", { graded: true }), week("2026-10-12", { graded: true }), week("2026-10-19")],
        livestream: 20,
        portfolioFeedback: "Strong reel"
      })
    );
    expect(items.map((item) => item.key)).toEqual([
      weekSeenKey("2026-10-12"),
      weekSeenKey("2026-10-05"),
      LIVESTREAM_SEEN_KEY,
      PORTFOLIO_SEEN_KEY
    ]);
  });
});

describe("grades seenChanges", () => {
  const items: SeenItem[] = [
    { key: "a", signature: "1", addedLabel: "a added", changedLabel: "a changed" },
    { key: "b", signature: "2", addedLabel: "b added", changedLabel: "b changed" }
  ];

  it("flags nothing on a first visit", () => {
    expect(seenChanges(null, items)).toEqual([]);
  });

  it("tells added items from changed ones and ignores unchanged ones", () => {
    expect(seenChanges({ b: "old" }, items)).toEqual([
      { key: "a", label: "a added" },
      { key: "b", label: "b changed" }
    ]);
    expect(seenChanges(seenMapOf(items), items)).toEqual([]);
  });

  it("says a cycle was published when it was in progress last visit", () => {
    const before = payload({ cycles: [cycle(1)], finalCuts: [null], checkIns: [15] });
    const after = payload({ cycles: [cycle(1, { published: true })], finalCuts: [42], checkIns: [20] });
    expect(labelsFor(before, after)).toEqual(["Cycle 1 published"]);
  });

  it("flags a score change on a published cycle that isn't marked revised", () => {
    const before = payload({ cycles: [cycle(1, { published: true })], finalCuts: [40], checkIns: [20] });
    const after = payload({ cycles: [cycle(1, { published: true })], finalCuts: [44], checkIns: [20] });
    expect(labelsFor(before, after)).toEqual(["Cycle 1 updated"]);
  });

  it("flags an edited producer note and a revision", () => {
    const before = payload({ cycles: [cycle(1, { published: true, feedback: "Good" })], finalCuts: [40], checkIns: [20] });
    const edited = payload({ cycles: [cycle(1, { published: true, feedback: "Good, tighten the intro" })], finalCuts: [40], checkIns: [20] });
    expect(labelsFor(before, edited)).toEqual(["Cycle 1 updated"]);

    const revised = payload({
      cycles: [cycle(1, { published: true, revised: true, revisedAt: "2026-10-14T18:00:00.000Z", feedback: "Good" })],
      finalCuts: [45],
      checkIns: [20]
    });
    expect(labelsFor(before, revised)).toEqual(["Cycle 1 revised"]);
  });

  it("flags in-progress check-in changes", () => {
    const before = payload({ cycles: [cycle(3)], finalCuts: [null], checkIns: [5] });
    const after = payload({ cycles: [cycle(3)], finalCuts: [null], checkIns: [10] });
    expect(labelsFor(before, after)).toEqual(["Cycle 3 scores updated"]);
  });
});

describe("grades seenSummary and storage shape", () => {
  it("is empty with no changes, capitalised, and folds the rest into 'N more'", () => {
    expect(seenSummary([])).toBe("");
    const changes = ["week of Oct 12 graded", "b", "c", "d", "e"].map((label, index) => ({ key: String(index), label }));
    expect(seenSummary(changes)).toBe("Week of Oct 12 graded · b · c · 2 more");
  });

  it("accepts only string-to-string maps from storage", () => {
    expect(isSeenMap({ a: "1" })).toBe(true);
    expect(isSeenMap({ a: 1 })).toBe(false);
    expect(isSeenMap(["a"])).toBe(false);
    expect(isSeenMap(null)).toBe(false);
  });
});
