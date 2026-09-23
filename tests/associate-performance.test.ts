import { describe, expect, it } from "vitest";
import { scoreAssociate, type AssociateStageSample } from "@/src/lib/associate-performance";

const now = new Date("2026-09-12T12:00:00Z");
const sample = (overrides: Partial<AssociateStageSample> = {}): AssociateStageSample => ({
  rowId: "group", topic: "Story", stage: "a-roll", submittedAt: "2026-09-08T12:00:00Z",
  respondedAt: "2026-09-09T12:00:00Z", hasFeedback: true, historicalUnknown: false,
  estimated: false, ...overrides
});

describe("associate performance", () => {
  it("scores timely reviewed work with feedback at 100", () => {
    expect(scoreAssociate([sample()], now)).toMatchObject({ score: 100, medianHours: 24, reviewed: 1, eligible: 1 });
  });
  it("uses the agreed weights and counts overdue unanswered work", () => {
    expect(scoreAssociate([sample(), sample({ rowId: "other", respondedAt: null, hasFeedback: false })], now))
      .toMatchObject({ score: 50, responsiveness: 50, reviewCoverage: 50, feedbackCoverage: 50, pending: 1 });
  });
  it("gives fresh submissions a 48-hour grace period", () => {
    expect(scoreAssociate([sample({ submittedAt: "2026-09-12T10:00:00Z", respondedAt: null, hasFeedback: false })], now))
      .toMatchObject({ score: null, eligible: 0, pending: 1 });
  });
  it("excludes missing history instead of treating it as failure", () => {
    expect(scoreAssociate([sample({ historicalUnknown: true, respondedAt: null })], now))
      .toMatchObject({ score: null, unknown: 1, pending: 0 });
  });
  it("does not reward comment volume or penalize groups with no submitted work", () => {
    expect(scoreAssociate([], now).score).toBeNull();
    expect(scoreAssociate([sample({ hasFeedback: false })], now).score).toBe(88);
  });
  it("computes a median and considers exactly 48h timely", () => {
    expect(scoreAssociate([sample(), sample({ respondedAt: "2026-09-10T12:00:00Z" })], now))
      .toMatchObject({ medianHours: 36, responsiveness: 100 });
  });
  it("ignores responses before submission and future submissions", () => {
    expect(scoreAssociate([sample({ respondedAt: "2026-09-07T12:00:00Z" })], now).reviewed).toBe(0);
    expect(scoreAssociate([sample({ submittedAt: "2026-09-13T12:00:00Z" })], now).score).toBeNull();
  });
});

it("counts attributed historical reviews without inventing response timing", () => {
  expect(scoreAssociate([sample({ submittedAt: null, historicalUnknown: true })], now)).toMatchObject({
    reviewed: 1, reviewCoverage: 100, feedbackCoverage: 100, medianHours: null,
    responsiveness: null, score: 100, provisional: true, missingTiming: 1
  });
});
