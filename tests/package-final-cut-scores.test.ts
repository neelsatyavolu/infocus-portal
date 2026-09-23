import { describe, expect, it } from "vitest";
import {
  averageExecutiveScores,
  canGradeFinalCut,
  clampFinalCutScore,
  executiveGradeStatus,
  roundToTenth
} from "@/src/lib/package-final-cut-scores";
import { previewFinalCutOfficial } from "@/src/lib/package-revisions";

describe("executive final-cut scores", () => {
  it("rounds the average to the nearest tenth", () => {
    expect(averageExecutiveScores([40, 45, 46])).toBe(43.7);
    expect(averageExecutiveScores([40, 45, 50])).toBe(45);
    expect(averageExecutiveScores([41])).toBe(41);
    expect(averageExecutiveScores([])).toBeNull();
  });

  it("rounds half-up at the tenth", () => {
    expect(roundToTenth(43.65)).toBe(43.7);
    expect(roundToTenth(43.64)).toBe(43.6);
    expect(clampFinalCutScore(50.4)).toBe(50);
    expect(clampFinalCutScore(-1)).toBe(0);
  });

  it("lets only executive producers grade", () => {
    expect(canGradeFinalCut("EXECUTIVE_PRODUCER")).toBe(true);
    expect(canGradeFinalCut("SUPER_ADMIN")).toBe(true);
    expect(canGradeFinalCut("ASSOCIATE_PRODUCER")).toBe(false);
    expect(canGradeFinalCut("ADVISER")).toBe(false);
    expect(canGradeFinalCut(null)).toBe(false);
  });

  it("waits for every required executive before averaging", () => {
    const waiting = executiveGradeStatus({
      requiredGraderIds: ["ep1", "ep2", "ep3"],
      scores: [
        { graderUserId: "ep1", points: 40 },
        { graderUserId: "admin", points: 50 }
      ]
    });
    expect(waiting.complete).toBe(false);
    expect(waiting.average).toBeNull();
    expect(waiting.pendingIds).toEqual(["ep2", "ep3"]);

    const done = executiveGradeStatus({
      requiredGraderIds: ["ep1", "ep2", "ep3"],
      scores: [
        { graderUserId: "ep1", points: 40 },
        { graderUserId: "ep2", points: 45 },
        { graderUserId: "ep3", points: 46 },
        { graderUserId: "admin", points: 50 }
      ]
    });
    expect(done.complete).toBe(true);
    expect(done.average).toBe(45.3);
    expect(done.pendingIds).toEqual([]);
  });

  it("uses submitted scores when no required executives exist", () => {
    const empty = executiveGradeStatus({ requiredGraderIds: [], scores: [] });
    expect(empty.complete).toBe(false);
    expect(empty.average).toBeNull();

    const adminOnly = executiveGradeStatus({
      requiredGraderIds: [],
      scores: [{ graderUserId: "admin", points: 44 }]
    });
    expect(adminOnly.complete).toBe(true);
    expect(adminOnly.average).toBe(44);
  });

  it("previews official points after the revision cap and late penalty", () => {
    expect(previewFinalCutOfficial({ average: null, revisionCount: 1, penaltyMultiplier: 0.2 })).toEqual({
      quality: null,
      afterRevisionCap: null,
      official: null,
      revisionCapped: false
    });
    expect(previewFinalCutOfficial({ average: 50, revisionCount: 1, penaltyMultiplier: 0.2 })).toEqual({
      quality: 50,
      afterRevisionCap: 50,
      official: 40,
      revisionCapped: false
    });
    expect(previewFinalCutOfficial({ average: 46, revisionCount: 2, penaltyMultiplier: 0.2 })).toEqual({
      quality: 46,
      afterRevisionCap: 37,
      official: 30,
      revisionCapped: true
    });
  });
});
