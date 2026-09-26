import { describe, expect, it } from "vitest";
import {
  averageExecutiveScores,
  canGradeFinalCut,
  clampFinalCutPart,
  clampFinalCutScore,
  executiveGradeStatus,
  gradersDoneWithGroup,
  legacyGroupGradeComplete,
  memberGradeStatus,
  roundToTenth,
  type FinalCutMemberScore
} from "@/src/lib/package-final-cut-scores";
import {
  memberGradeLocked,
  membersAwaitingFinalCutScores,
  nextMemberRevisionCount,
  previewFinalCutOfficial
} from "@/src/lib/package-revisions";

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

function memberScore(graderUserId: string, memberUserId: string | null, quality: number, effort: number): FinalCutMemberScore {
  return { graderUserId, memberUserId, points: quality + effort, qualityPoints: quality, effortPoints: effort };
}

describe("per-member final-cut scores", () => {
  it("clamps quality and effort to 0–25", () => {
    expect(clampFinalCutPart(25.4)).toBe(25);
    expect(clampFinalCutPart(-2)).toBe(0);
    expect(clampFinalCutPart(18.25)).toBe(18.3);
  });

  it("averages each member separately once every executive scored them", () => {
    const scores = [
      memberScore("ep1", "abby", 20, 25),
      memberScore("ep2", "abby", 22, 23),
      memberScore("ep1", "otto", 20, 10)
    ];
    const abby = memberGradeStatus({ requiredGraderIds: ["ep1", "ep2"], scores, memberUserId: "abby" });
    expect(abby.complete).toBe(true);
    expect(abby.average).toBe(45);
    expect(abby.qualityAverage).toBe(21);
    expect(abby.effortAverage).toBe(24);

    const otto = memberGradeStatus({ requiredGraderIds: ["ep1", "ep2"], scores, memberUserId: "otto" });
    expect(otto.complete).toBe(false);
    expect(otto.average).toBeNull();
    expect(otto.qualityAverage).toBeNull();
    expect(otto.pendingIds).toEqual(["ep2"]);
  });

  it("ignores legacy whole-group scores for members", () => {
    const scores: FinalCutMemberScore[] = [
      { graderUserId: "ep1", memberUserId: null, points: 44, qualityPoints: null, effortPoints: null }
    ];
    expect(memberGradeStatus({ requiredGraderIds: ["ep1"], scores, memberUserId: "abby" }).complete).toBe(false);
    expect(legacyGroupGradeComplete({ requiredGraderIds: ["ep1"], scores })).toBe(true);
    expect(legacyGroupGradeComplete({ requiredGraderIds: ["ep1", "ep2"], scores })).toBe(false);
  });

  it("marks an executive done only after scoring every member", () => {
    const scores = [
      memberScore("ep1", "abby", 20, 20),
      memberScore("ep1", "otto", 20, 20),
      memberScore("ep2", "abby", 20, 20),
      { graderUserId: "ep3", memberUserId: null, points: 40, qualityPoints: null, effortPoints: null }
    ];
    expect(gradersDoneWithGroup(scores, ["abby", "otto"]).sort()).toEqual(["ep1", "ep3"]);
  });
});

describe("per-member revisions", () => {
  it("counts a first grade, an edit, and a regrade on a new cut", () => {
    expect(nextMemberRevisionCount({ alreadyGraded: false, revisionCount: 0, scoresWereComplete: false })).toBe(1);
    expect(nextMemberRevisionCount({ alreadyGraded: true, revisionCount: 1, scoresWereComplete: true })).toBe(1);
    expect(nextMemberRevisionCount({ alreadyGraded: true, revisionCount: 1, scoresWereComplete: false })).toBe(2);
  });

  it("locks members at 75% or more while the group revises for someone else", () => {
    expect(memberGradeLocked({ awardedPoints: 45, revisionCount: 1, scoresComplete: false })).toBe(true);
    expect(memberGradeLocked({ awardedPoints: 30, revisionCount: 1, scoresComplete: false })).toBe(false);
    expect(memberGradeLocked({ awardedPoints: 45, revisionCount: 1, scoresComplete: true })).toBe(false);
    expect(memberGradeLocked({ awardedPoints: null, revisionCount: 0, scoresComplete: false })).toBe(false);
  });
});

describe("members awaiting scores", () => {
  it("drops members locked at 75%+ while the group revises", () => {
    const scores = [memberScore("ep1", "otto", 15, 15)];
    const grades = [
      { userId: "abby", awardedFinalCutPoints: 45, revisionCount: 1 },
      { userId: "otto", awardedFinalCutPoints: 30, revisionCount: 1 },
      { userId: "sage", awardedFinalCutPoints: 44, revisionCount: 1 }
    ];
    expect(membersAwaitingFinalCutScores(["abby", "otto", "sage"], scores, grades)).toEqual(["otto"]);
    expect(
      membersAwaitingFinalCutScores(["abby"], [memberScore("ep1", "abby", 20, 20)], grades)
    ).toEqual(["abby"]);
  });
});
