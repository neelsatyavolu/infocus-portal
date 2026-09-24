import { describe, expect, it } from "vitest";
import {
  checkInDeadlinePassed,
  checkInGradeForCycle,
  checkInGradeForProgress,
  checkInOverrides,
  cycleCheckInDates,
  effectiveGroupApprovalStage,
  releasedCheckInScores,
  groupNavTabDone,
  isGroupNavSlug,
  isGroupStageSlug,
  pendingGroupNavSlug,
  pendingGroupStageSlug,
  pendingPackageStage,
  padCheckInsToSemesterMax,
  sumReleasedCheckIns
} from "@/src/lib/package-stages";

describe("pending package stage", () => {
  it("returns the first incomplete stage", () => {
    expect(pendingPackageStage({})).toBe("pitching");
    expect(pendingPackageStage({ pitching: true })).toBe("proofOfContact");
    expect(pendingPackageStage({ pitching: true, proofOfContact: true })).toBe("aRollBRoll");
    expect(
      pendingPackageStage({ pitching: true, proofOfContact: true, aRollBRoll: true })
    ).toBe("initialCut");
    expect(
      pendingPackageStage({
        pitching: true,
        proofOfContact: true,
        aRollBRoll: true,
        initialCut: true
      })
    ).toBe("finalCut");
  });

  it("stays on final cut after the package is complete", () => {
    expect(
      pendingPackageStage({
        pitching: true,
        proofOfContact: true,
        aRollBRoll: true,
        initialCut: true,
        finalCut: true
      })
    ).toBe("finalCut");
  });

  it("maps the pending stage to the Groups URL slug", () => {
    expect(pendingGroupStageSlug({ pitching: true })).toBe("brainstorming");
    expect(
      pendingGroupStageSlug({
        pitching: true,
        proofOfContact: true,
        aRollBRoll: true,
        initialCut: true
      })
    ).toBe("final-cut");
  });

  it("accepts producer group stage slugs", () => {
    expect(isGroupStageSlug("brainstorming")).toBe(true);
    expect(isGroupStageSlug("a-roll")).toBe(true);
    expect(isGroupStageSlug("pitch")).toBe(false);
  });
});

describe("check-in grade release", () => {
  const dates = {
    pitching: new Date("2026-08-28T00:00:00.000Z"),
    proofOfContact: new Date("2026-09-02T00:00:00.000Z"),
    aRollBRoll: new Date("2026-09-11T00:00:00.000Z"),
    initialCut: new Date("2026-09-16T00:00:00.000Z")
  };

  it("treats a deadline as passed on that UTC date", () => {
    expect(checkInDeadlinePassed(dates.pitching, new Date("2026-08-27T23:59:59.000Z"))).toBe(false);
    expect(checkInDeadlinePassed(dates.pitching, new Date("2026-08-28T00:00:00.000Z"))).toBe(true);
  });

  it("stays ungraded until the first stage deadline", () => {
    expect(
      checkInGradeForCycle({
        now: new Date("2026-08-16T12:00:00.000Z"),
        dates,
        submitted: { pitching: false, proofOfContact: true },
        approved: { pitching: true }
      })
    ).toEqual({
      earned: null,
      possible: 0,
      stages: { pitching: false, proofOfContact: false, aRollBRoll: false, initialCut: false }
    });
  });

  it("releases pitching as zero when the deadline passed and it was not marked", () => {
    expect(
      checkInGradeForCycle({
        now: new Date("2026-08-29T00:00:00.000Z"),
        dates,
        submitted: {},
        approved: {}
      })
    ).toMatchObject({ earned: 0, possible: 5, stages: { pitching: false } });
  });

  it("credits a submitted brainstorm after its deadline without approval", () => {
    const grade = checkInGradeForCycle({
      now: new Date("2026-09-03T00:00:00.000Z"),
      dates,
      submitted: { proofOfContact: true },
      approved: { pitching: true, proofOfContact: false }
    });
    expect(grade).toEqual({
      earned: 10,
      possible: 10,
      stages: { pitching: true, proofOfContact: true, aRollBRoll: false, initialCut: false }
    });
  });

  it("does not wait for later stages that are not due yet", () => {
    const grade = checkInGradeForCycle({
      now: new Date("2026-09-03T00:00:00.000Z"),
      dates,
      submitted: { proofOfContact: true, aRollBRoll: true, initialCut: true },
      approved: { pitching: true }
    });
    expect(grade.possible).toBe(10);
    expect(grade.stages.aRollBRoll).toBe(false);
    expect(grade.stages.initialCut).toBe(false);
  });

  it("requires approval for submitted A-roll/B-roll, including work needing revisions", () => {
    for (const approved of [false, true]) {
      const grade = checkInGradeForCycle({
        now: new Date("2026-09-11T00:00:00.000Z"),
        dates: { aRollBRoll: dates.aRollBRoll },
        submitted: { aRollBRoll: true },
        approved: { aRollBRoll: approved }
      });
      expect(grade.earned).toBe(approved ? 5 : 0);
      expect(grade.possible).toBe(5);
    }
  });

  it("still credits producer approval when the submit heuristic missed", () => {
    const grade = checkInGradeForCycle({
      now: new Date("2026-09-17T00:00:00.000Z"),
      dates,
      submitted: {},
      approved: { pitching: true, proofOfContact: true, aRollBRoll: true, initialCut: true }
    });
    expect(grade).toEqual({
      earned: 20,
      possible: 20,
      stages: { pitching: true, proofOfContact: true, aRollBRoll: true, initialCut: true }
    });
  });

  it("credits pitching after the deadline if the student is on the package", () => {
    const grade = checkInGradeForProgress({
      now: new Date("2026-08-29T00:00:00.000Z"),
      dates,
      row: {
        pitching: false,
        proofOfContact: false,
        aRollBRoll: false,
        initialCut: false,
        brainstormDocUrl: "",
        proofOfContactCount: 0,
        hasARollMedia: false,
        hasInitialCutMedia: false
      }
    });
    expect(grade).toMatchObject({ earned: 5, possible: 5, stages: { pitching: true } });
  });

  it("docks pitching after the deadline when the student is not on a package", () => {
    expect(
      checkInGradeForProgress({
        now: new Date("2026-08-29T00:00:00.000Z"),
        dates,
        row: null
      })
    ).toMatchObject({ earned: 0, possible: 5, stages: { pitching: false } });
  });

  it("applies zero and partial overrides to official credit and preserves future N/A", () => {
    const now = new Date("2026-09-11T00:00:00Z");
    const overrides = checkInOverrides({ pitchingPoints: 0, proofOfContactPoints: 3, aRollBRollPoints: 4, initialCutPoints: 5 });
    const grade = checkInGradeForCycle({ now, dates, submitted: { pitching: true, proofOfContact: true }, approved: {}, overrides });
    expect(grade.earned).toBe(7);
    expect(grade.possible).toBe(15);
    expect(releasedCheckInScores(grade, dates, now, overrides)).toEqual({ pitching: 0, proofOfContact: 3, aRollBRoll: 4, initialCut: null });
    expect(padCheckInsToSemesterMax({ releasedEarned: grade.earned, releasedPossible: grade.possible, semesterMax: 60 })).toEqual({ earned: 52, possible: 60 });
  });

  it("restores automatic approval credit when an override is cleared", () => {
    const grade = checkInGradeForCycle({ now: new Date("2026-09-11T00:00:00Z"), dates, submitted: { pitching: true }, approved: { aRollBRoll: true }, overrides: { aRollBRoll: null } });
    expect(grade.earned).toBe(10);
    expect(grade.stages.aRollBRoll).toBe(true);
  });

  it("sums only released check-in cycles", () => {
    expect(
      sumReleasedCheckIns([
        { earned: null, possible: 0, stages: { pitching: false, proofOfContact: false, aRollBRoll: false, initialCut: false } },
        { earned: 5, possible: 5, stages: { pitching: true, proofOfContact: false, aRollBRoll: false, initialCut: false } },
        { earned: 0, possible: 10, stages: { pitching: false, proofOfContact: false, aRollBRoll: false, initialCut: false } }
      ])
    ).toEqual({ earned: 5, possible: 15 });
    expect(
      sumReleasedCheckIns([
        { earned: null, possible: 0, stages: { pitching: false, proofOfContact: false, aRollBRoll: false, initialCut: false } }
      ])
    ).toEqual({ earned: null, possible: 0 });
  });

  it("moves every check-in deadline by the student's extension days", () => {
    const cycle = {
      pitchingDate: dates.pitching,
      proofOfContactDate: dates.proofOfContact,
      aRollBRollDate: dates.aRollBRoll,
      initialCutDate: new Date("2026-10-14T00:00:00.000Z")
    };
    expect(cycleCheckInDates(cycle, 10)).toEqual({
      pitching: new Date("2026-09-07T00:00:00.000Z"),
      proofOfContact: new Date("2026-09-12T00:00:00.000Z"),
      aRollBRoll: new Date("2026-09-21T00:00:00.000Z"),
      initialCut: new Date("2026-10-24T00:00:00.000Z")
    });
    expect(cycleCheckInDates(cycle)).toEqual({
      pitching: dates.pitching,
      proofOfContact: dates.proofOfContact,
      aRollBRoll: dates.aRollBRoll,
      initialCut: cycle.initialCutDate
    });
  });

  it("does not dock unapproved A-roll/B-roll before the extended deadline", () => {
    const cycle = { aRollBRollDate: dates.aRollBRoll };
    const now = new Date("2026-09-15T00:00:00.000Z");
    const grade = (extensionDays: number) =>
      checkInGradeForCycle({
        now,
        dates: { aRollBRoll: cycleCheckInDates(cycle, extensionDays).aRollBRoll },
        submitted: { aRollBRoll: true },
        approved: {}
      });
    expect(grade(0)).toMatchObject({ earned: 0, possible: 5 });
    expect(grade(10)).toMatchObject({ earned: null, possible: 0 });
  });

  it("pads unreleased S1 check-ins to 60 and only subtracts missed due work", () => {
    expect(
      padCheckInsToSemesterMax({ releasedEarned: 10, releasedPossible: 10, semesterMax: 60 })
    ).toEqual({ earned: 60, possible: 60 });
    expect(
      padCheckInsToSemesterMax({ releasedEarned: 5, releasedPossible: 10, semesterMax: 60 })
    ).toEqual({ earned: 55, possible: 60 });
    expect(
      padCheckInsToSemesterMax({ releasedEarned: null, releasedPossible: 0, semesterMax: 60 })
    ).toEqual({ earned: null, possible: null });
  });
});

describe("Groups approval-chain nav", () => {
  it("keeps a revision request at the stage that reviewed the current cut", () => {
    const row = { pitching: true, proofOfContact: true, aRollBRoll: true, finalCut: false };
    for (const [reviewStage, slug] of [
      ["ASSOCIATE_REVIEW", "initial-stage-1"],
      ["ADVISER_REVIEW", "initial-stage-2"],
      ["EXECUTIVE_REVIEW", "initial-stage-3"]
    ] as const) {
      const stage = effectiveGroupApprovalStage("DRAFT", true, reviewStage);
      expect(pendingGroupNavSlug({ ...row, approvalStage: stage })).toBe(slug);
      expect(groupNavTabDone(slug, { ...row, approvalStage: stage })).toBe(false);
    }
    expect(effectiveGroupApprovalStage("DRAFT", false, "ADVISER_REVIEW")).toBe("DRAFT");
    expect(effectiveGroupApprovalStage("ADVISER_REVIEW", true, "EXECUTIVE_REVIEW")).toBe("ADVISER_REVIEW");
  });

  it("sends Stage 2 work to Initial 2 instead of Final Cut", () => {
    const row = { pitching: true, proofOfContact: true, aRollBRoll: true, finalCut: false };
    expect(pendingGroupNavSlug({ ...row, approvalStage: "ASSOCIATE_REVIEW" })).toBe("initial-stage-1");
    expect(pendingGroupNavSlug({ ...row, approvalStage: "ADVISER_REVIEW" })).toBe("initial-stage-2");
    expect(pendingGroupNavSlug({ ...row, approvalStage: "EXECUTIVE_REVIEW" })).toBe("initial-stage-3");
    expect(pendingGroupNavSlug({ ...row, approvalStage: "APPROVED" })).toBe("final-cut");
    expect(isGroupNavSlug("initial-stage-2")).toBe(true);
    expect(groupNavTabDone("initial-stage-1", { ...row, approvalStage: "ADVISER_REVIEW" })).toBe(true);
    expect(groupNavTabDone("initial-stage-2", { ...row, approvalStage: "ADVISER_REVIEW" })).toBe(false);
  });
});
