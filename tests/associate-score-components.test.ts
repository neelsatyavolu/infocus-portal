import { describe, expect, it } from "vitest";
import { combineAssociateScore, groupProgress, groupFeedbackScore } from "@/src/lib/associate-score-components";
const now = new Date("2026-09-12T12:00:00Z");
describe("associate score components", () => {
  it("uses the six agreed weights", () => {
    expect(combineAssociateScore({ quality: 80, progress: 60, responsiveness: 100, reviewCoverage: 100, feedbackCoverage: 100, groupFeedback: 100 }))
      .toEqual({ score: 85, availableWeight: 100, provisional: false });
  });
  it("renormalizes missing evidence and labels the result provisional", () => {
    expect(combineAssociateScore({ progress: 60 })).toEqual({ score: 60, availableWeight: 25, provisional: true });
    expect(combineAssociateScore({}).score).toBeNull();
    expect(combineAssociateScore({ quality: 0 }).score).toBe(0);
  });
  it("ignores future and unscheduled milestones", () => {
    expect(groupProgress([{ label: "Pitch", dueAt: "2026-09-01", complete: true }, { label: "Final", dueAt: "2026-09-20", complete: false }, { label: "Contact", dueAt: null, complete: false }], now))
      .toMatchObject({ score: 100, due: 1, completed: 1 });
  });
  it("counts overdue incomplete stages and returns null when nothing is due", () => {
    expect(groupProgress([{ label: "A-roll", dueAt: "2026-09-01", complete: false }], now).score).toBe(0);
    expect(groupProgress([], now).score).toBeNull();
  });
  it("maps anchored 1–5 ratings to 0–100 without treating missing reviews as zero", () => {
    expect(groupFeedbackScore([])).toBeNull();
    expect(groupFeedbackScore([{ helpfulness: 1, communication: 1, support: 1 }])).toBe(0);
    expect(groupFeedbackScore([{ helpfulness: 5, communication: 5, support: 5 }])).toBe(100);
  });
});
