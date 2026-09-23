import { describe, expect, it } from "vitest";
import {
  FIRST_PARTICIPATION_DATE,
  GRADE_WEIGHTS,
  MAX_FINAL_CUT_POINTS,
  hasGradeableWork,
  letterGrade,
  packageCategoryScore,
  participationPointsForDate,
  participationPointsForWeek,
  sumParticipationMax,
  weightedGradePercentage
} from "@/src/lib/grading";
import {
  applyDecision,
  canActOnStage,
  canApproveAnyway,
  canPublish,
  isApprovedForFinalCut,
  nextStage,
  remainingExecutiveSignoffs,
  requiredExecutiveSignoffs,
  type ApprovalState
} from "@/src/lib/package-approval";
import {
  applyLatePenalty,
  calculateLatePenalty,
  effectiveDeadline,
  isExtensionGranted,
  isGroupConsentComplete
} from "@/src/lib/package-extensions";
import {
  capAwardedForRevision,
  isEligibleForSecondRevision,
  unresolvedFinalCutPoints,
  SECOND_REVISION_CAP_POINTS
} from "@/src/lib/package-revisions";
import {
  consecutiveGroupmateOverlaps,
  previousTeammatesByUserFromGroups
} from "@/src/lib/consecutive-groupmates";
import {
  CHECK_IN_STAGES,
  MAX_CHECK_IN_POINTS_PER_CYCLE,
  checkInPointsForCycle,
  isManOnTheStreetTopic,
  parsePackageCategory
} from "@/src/lib/package-stages";

describe("check-in stages", () => {
  it("counts four check-ins worth 20 points a cycle", () => {
    // The final cut is the 50-point deliverable, not a check-in.
    expect(CHECK_IN_STAGES).toHaveLength(4);
    expect(CHECK_IN_STAGES).not.toContain("finalCut");
    expect(MAX_CHECK_IN_POINTS_PER_CYCLE).toBe(20);
  });

  it("awards five points per completed stage", () => {
    expect(checkInPointsForCycle({})).toBe(0);
    expect(checkInPointsForCycle({ pitching: true })).toBe(5);
    expect(
      checkInPointsForCycle({ pitching: true, proofOfContact: true, aRollBRoll: true, initialCut: true })
    ).toBe(20);
  });

  it("ignores the final cut when totalling check-in credit", () => {
    expect(checkInPointsForCycle({ finalCut: true })).toBe(0);
  });

  it("still credits later stages when an early one was missed", () => {
    expect(checkInPointsForCycle({ proofOfContact: true, initialCut: true })).toBe(10);
  });
});

describe("package categories", () => {
  it("maps legacy free-text group types onto the three categories", () => {
    expect(parsePackageCategory("News")).toBe("NEWS");
    expect(parsePackageCategory("feature story")).toBe("FEATURE");
    expect(parsePackageCategory("Commentary")).toBe("COMMENTARY");
    expect(parsePackageCategory("opinion")).toBe("COMMENTARY");
    expect(parsePackageCategory("")).toBeNull();
    expect(parsePackageCategory("something else")).toBeNull();
  });

  it("flags man-on-the-street topics, which cannot be a primary package", () => {
    expect(isManOnTheStreetTopic("Man on the street: finals week")).toBe(true);
    expect(isManOnTheStreetTopic("MOTS about parking")).toBe(true);
    expect(isManOnTheStreetTopic("Board meeting recap")).toBe(false);
    expect(isManOnTheStreetTopic(null)).toBe(false);
  });
});

describe("weighted grading", () => {
  it("weights the three categories 55/35/10", () => {
    expect(GRADE_WEIGHTS.packages + GRADE_WEIGHTS.participation + GRADE_WEIGHTS.portfolio).toBeCloseTo(1);
  });

  it("returns 100 percent for a perfect record", () => {
    const percentage = weightedGradePercentage({
      finalCutPoints: [50, 50, 50],
      checkInPoints: [20, 20, 20],
      livestreamPoints: 40,
      participationEarned: 900,
      participationPossible: 900,
      portfolioPoints: 100
    });

    expect(percentage).toBe(100);
  });

  it("weights participation more heavily than the portfolio", () => {
    const strongParticipation = weightedGradePercentage({
      finalCutPoints: [50],
      checkInPoints: [20],
      livestreamPoints: 40,
      participationEarned: 100,
      participationPossible: 100,
      portfolioPoints: 0
    });

    const strongPortfolio = weightedGradePercentage({
      finalCutPoints: [50],
      checkInPoints: [20],
      livestreamPoints: 40,
      participationEarned: 0,
      participationPossible: 100,
      portfolioPoints: 100
    });

    expect(strongParticipation).toBeGreaterThan(strongPortfolio);
  });

  it("drops the portfolio category until it has been graded", () => {
    // Early in the semester there is no portfolio, so it must not count as a zero.
    const percentage = weightedGradePercentage({
      finalCutPoints: [50],
      checkInPoints: [20],
      livestreamPoints: 40,
      participationEarned: 50,
      participationPossible: 50,
      portfolioPoints: null
    });

    expect(percentage).toBe(100);
  });

  it("counts a graded zero portfolio against the student", () => {
    const percentage = weightedGradePercentage({
      finalCutPoints: [50],
      checkInPoints: [20],
      livestreamPoints: 40,
      participationEarned: 50,
      participationPossible: 50,
      portfolioPoints: 0
    });

    expect(percentage).toBe(90);
  });

  // A day-one student has no grade. Reporting 0% would render as an F.
  it("reports no gradeable work when nothing has been marked", () => {
    const nothing = {
      finalCutPoints: [null, null, null],
      checkInPoints: [null, null, null],
      livestreamPoints: null,
      participationEarned: 0,
      participationPossible: 0,
      portfolioPoints: null
    };

    expect(hasGradeableWork(nothing)).toBe(false);
    expect(weightedGradePercentage(nothing)).toBe(0);
  });

  it("reports gradeable work as soon as any category has something", () => {
    expect(
      hasGradeableWork({
        finalCutPoints: [null],
        checkInPoints: [0],
        livestreamPoints: null,
        participationEarned: 0,
        participationPossible: 0,
        portfolioPoints: null
      })
    ).toBe(true);
  });

  it("maps percentages to letters", () => {
    expect(letterGrade(95)).toBe("A");
    expect(letterGrade(85)).toBe("B");
    expect(letterGrade(75)).toBe("C");
    expect(letterGrade(65)).toBe("D");
    expect(letterGrade(20)).toBe("F");
  });

  it("scores PA Mondays at 10, class Tue/Thu at 20, and Wed/Fri shows at 0", () => {
    // 2026-09-14 = Monday, 15 = Tue, 16 = Wed, 17 = Thu, 18 = Fri (UTC)
    expect(participationPointsForDate(new Date("2026-09-14T00:00:00.000Z"))).toBe(10);
    expect(participationPointsForDate(new Date("2026-09-15T00:00:00.000Z"))).toBe(20);
    expect(participationPointsForDate(new Date("2026-09-16T00:00:00.000Z"))).toBe(0);
    expect(participationPointsForDate(new Date("2026-09-17T00:00:00.000Z"))).toBe(20);
    expect(participationPointsForDate(new Date("2026-09-18T00:00:00.000Z"))).toBe(0);
  });

  it("scores nothing before the first gradeable participation day", () => {
    // 2026-08-17 Mon is a PA day, but grades start Aug 18 (Tuesday class).
    expect(FIRST_PARTICIPATION_DATE).toBe("2026-08-18");
    expect(participationPointsForDate(new Date("2026-08-14T00:00:00.000Z"))).toBe(0);
    expect(participationPointsForDate(new Date("2026-08-17T00:00:00.000Z"))).toBe(0);
    expect(participationPointsForDate(new Date("2026-08-18T00:00:00.000Z"))).toBe(20);
    expect(participationPointsForDate(new Date("2026-08-19T00:00:00.000Z"))).toBe(0);
  });

  it("scores PAUSD holidays at 0 (Labor Day 2026-09-07)", () => {
    expect(participationPointsForDate(new Date("2026-09-07T00:00:00.000Z"))).toBe(0);
  });

  it("week totals use the sum of daily maxes, not a flat 50", () => {
    // First week: Mon Aug 17 is before FIRST_PARTICIPATION_DATE, so 0+20+0+20+0.
    expect(participationPointsForWeek(new Date("2026-08-17T00:00:00.000Z"))).toBe(40);
    expect(participationPointsForWeek(new Date("2026-09-14T00:00:00.000Z"))).toBe(50);
    // Labor Day week: Monday holiday, Tue/Thu class still count.
    expect(participationPointsForWeek(new Date("2026-09-07T00:00:00.000Z"))).toBe(40);
    expect(
      sumParticipationMax([
        { maxPoints: 0 },
        { maxPoints: 20 },
        { maxPoints: 0 },
        { maxPoints: 20 },
        { maxPoints: 0 }
      ])
    ).toBe(40);
  });

  // Participation dates are stored as UTC midnight. Reading the weekday in
  // local time rolls a Monday back to Sunday anywhere behind UTC (Palo Alto is
  // UTC-7/8), which would score Mondays out of 20 instead of 10.
  it("reads the weekday in UTC so stored dates do not shift", () => {
    expect(participationPointsForDate(new Date("2026-09-14T00:00:00.000Z"))).toBe(10);
    expect(participationPointsForDate(new Date("2026-09-15T00:00:00.000Z"))).toBe(20);
  });

  it("excludes cycles that have not been graded yet", () => {
    // Only cycle 1 is graded; cycles 2 and 3 must not count as zeros.
    const percentage = weightedGradePercentage({
      finalCutPoints: [50, null, null],
      checkInPoints: [20, null, null],
      livestreamPoints: null,
      participationEarned: 100,
      participationPossible: 100,
      portfolioPoints: null
    });

    expect(percentage).toBe(100);
  });

  it("excludes livestream credit until it is tracked", () => {
    const percentage = weightedGradePercentage({
      finalCutPoints: [50],
      checkInPoints: [20],
      livestreamPoints: null,
      participationEarned: 50,
      participationPossible: 50,
      portfolioPoints: null
    });

    expect(percentage).toBe(100);
  });

  it("counts livestream credit once it is supplied", () => {
    const percentage = weightedGradePercentage({
      finalCutPoints: [50],
      checkInPoints: [20],
      livestreamPoints: 0,
      participationEarned: 50,
      participationPossible: 50,
      portfolioPoints: null
    });

    // Packages 70/110 at weight .55, participation 100% at weight .35,
    // portfolio excluded, so the two active weights renormalise to .90.
    expect(percentage).toBeCloseTo(77.8, 0);
  });

  it("counts a missed check-in in a started cycle as a real zero", () => {
    const percentage = weightedGradePercentage({
      finalCutPoints: [null],
      checkInPoints: [0],
      livestreamPoints: null,
      participationEarned: 0,
      participationPossible: 0,
      portfolioPoints: null
    });

    expect(percentage).toBe(0);
  });

  it("scores only released check-in stages so one deadline is not 5/20", () => {
    expect(
      packageCategoryScore({
        finalCutPoints: [null],
        checkInPoints: [5],
        checkInPossible: [5],
        livestreamPoints: null,
        participationEarned: 0,
        participationPossible: 0,
        portfolioPoints: null
      })
    ).toEqual({ earned: 5, possible: 5 });

    expect(
      packageCategoryScore({
        finalCutPoints: [null],
        checkInPoints: [0],
        checkInPossible: [5],
        livestreamPoints: null,
        participationEarned: 0,
        participationPossible: 0,
        portfolioPoints: null
      })
    ).toEqual({ earned: 0, possible: 5 });
  });
});

describe("revision policy", () => {
  it("stays ungraded before the deadline when no final cut is in", () => {
    expect(
      unresolvedFinalCutPoints({
        awardedPoints: null,
        officialPoints: null,
        deadlinePassed: false,
        hasValidFinalCut: false
      })
    ).toBeNull();
  });

  it("marks 0 after the deadline until a valid final cut is submitted", () => {
    expect(
      unresolvedFinalCutPoints({
        awardedPoints: null,
        officialPoints: null,
        deadlinePassed: true,
        hasValidFinalCut: false
      })
    ).toBe(0);
  });

  it("lifts the auto-zero once a final cut through all stages is in", () => {
    expect(
      unresolvedFinalCutPoints({
        awardedPoints: null,
        officialPoints: null,
        deadlinePassed: true,
        hasValidFinalCut: true
      })
    ).toBeNull();
  });

  it("uses the official graded score once a producer has marked it", () => {
    expect(
      unresolvedFinalCutPoints({
        awardedPoints: 46,
        officialPoints: 37,
        deadlinePassed: true,
        hasValidFinalCut: true
      })
    ).toBe(37);
  });

  it("lets a first grade earn full marks", () => {
    expect(capAwardedForRevision(50, 1)).toBe(MAX_FINAL_CUT_POINTS);
    expect(isEligibleForSecondRevision(30, 1)).toBe(true);
    expect(isEligibleForSecondRevision(40, 1)).toBe(false);
  });

  it("caps a second revision at 75 percent without touching late penalty", () => {
    expect(SECOND_REVISION_CAP_POINTS).toBe(37);
    expect(capAwardedForRevision(50, 2)).toBe(37);
    expect(capAwardedForRevision(30, 2)).toBe(30);
    expect(isEligibleForSecondRevision(30, 2)).toBe(false);
  });
});

describe("consecutive groupmates", () => {
  it("flags members who shared a group last cycle", () => {
    const previous = previousTeammatesByUserFromGroups([
      ["ada", "grace"],
      ["linus"]
    ]);
    expect(consecutiveGroupmateOverlaps(["ada", "grace", "linus"], previous)).toEqual([
      { userId: "ada", withUserIds: ["grace"] },
      { userId: "grace", withUserIds: ["ada"] }
    ]);
    expect(consecutiveGroupmateOverlaps(["ada", "linus"], previous)).toEqual([]);
  });
});

describe("extension policy", () => {
  it("requires two distinct producer approvals", () => {
    expect(isExtensionGranted({ approvals: [] })).toBe(false);
    expect(isExtensionGranted({ approvals: [{ userId: "ep1", approved: true }] })).toBe(false);
    expect(
      isExtensionGranted({
        approvals: [
          { userId: "ep1", approved: true },
          { userId: "ep2", approved: true }
        ]
      })
    ).toBe(true);
  });

  it("does not let one producer approve twice", () => {
    expect(
      isExtensionGranted({
        approvals: [
          { userId: "ep1", approved: true },
          { userId: "ep1", approved: true }
        ]
      })
    ).toBe(false);
  });

  it("treats any denial as blocking", () => {
    expect(
      isExtensionGranted({
        approvals: [
          { userId: "ep1", approved: true },
          { userId: "ep2", approved: true },
          { userId: "ep3", approved: false }
        ]
      })
    ).toBe(false);
  });

  it("requires every group member to agree before a grant", () => {
    expect(
      isGroupConsentComplete({
        memberUserIds: ["s1", "s2"],
        consents: [{ userId: "s1", agreed: true }]
      })
    ).toBe(false);

    expect(
      isGroupConsentComplete({
        memberUserIds: ["s1"],
        consents: [{ userId: "s1", agreed: true }]
      })
    ).toBe(true);

    const producerOk = [
      { userId: "ep1", approved: true },
      { userId: "ep2", approved: true }
    ];

    expect(
      isExtensionGranted({
        approvals: producerOk,
        memberUserIds: ["s1", "s2"],
        consents: [{ userId: "s1", agreed: true }]
      })
    ).toBe(false);

    expect(
      isExtensionGranted({
        approvals: producerOk,
        memberUserIds: ["s1", "s2"],
        consents: [
          { userId: "s1", agreed: true },
          { userId: "s2", agreed: false }
        ]
      })
    ).toBe(false);

    expect(
      isExtensionGranted({
        approvals: producerOk,
        memberUserIds: ["s1", "s2"],
        consents: [
          { userId: "s1", agreed: true },
          { userId: "s2", agreed: true }
        ]
      })
    ).toBe(true);
  });

  it("extends the deadline by the approved days", () => {
    const finalCut = new Date("2026-09-30T00:00:00.000Z");
    expect(effectiveDeadline(finalCut, 3)?.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    // A copy, not the caller's own Date, so it cannot be mutated in place.
    expect(effectiveDeadline(finalCut, 0)).toEqual(finalCut);
    expect(effectiveDeadline(finalCut, 0)).not.toBe(finalCut);
    expect(effectiveDeadline(null, 3)).toBeNull();
  });

  it("charges 20 percent past the deadline and 30 percent beyond 14 days", () => {
    const deadline = new Date("2026-09-30T00:00:00.000Z");

    expect(calculateLatePenalty(deadline, new Date("2026-09-29T00:00:00.000Z")).penaltyMultiplier).toBe(0);
    expect(calculateLatePenalty(deadline, new Date("2026-10-02T00:00:00.000Z")).penaltyMultiplier).toBe(0.2);
    expect(calculateLatePenalty(deadline, new Date("2026-10-20T00:00:00.000Z")).penaltyMultiplier).toBe(0.3);
  });

  it("blocks a second revision only once more than 14 days late", () => {
    const deadline = new Date("2026-09-30T00:00:00.000Z");

    expect(calculateLatePenalty(deadline, new Date("2026-10-05T00:00:00.000Z")).blocksSecondRevision).toBe(false);
    expect(calculateLatePenalty(deadline, new Date("2026-10-20T00:00:00.000Z")).blocksSecondRevision).toBe(true);
  });

  it("applies the penalty to a score", () => {
    const deadline = new Date("2026-09-30T00:00:00.000Z");
    const penalty = calculateLatePenalty(deadline, new Date("2026-10-02T00:00:00.000Z"));

    expect(applyLatePenalty(50, penalty)).toBe(40);
  });
});

describe("approval chain", () => {
  function state(overrides: Partial<ApprovalState> = {}): ApprovalState {
    return { stage: "ASSOCIATE_REVIEW", controversial: false, signoffs: [], ...overrides };
  }

  it("moves through every stage in order without skipping", () => {
    expect(nextStage("DRAFT")).toBe("ASSOCIATE_REVIEW");
    expect(nextStage("ASSOCIATE_REVIEW")).toBe("ADVISER_REVIEW");
    expect(nextStage("ADVISER_REVIEW")).toBe("EXECUTIVE_REVIEW");
    expect(nextStage("EXECUTIVE_REVIEW")).toBe("APPROVED");
    expect(nextStage("APPROVED")).toBe("APPROVED");
  });

  it("lets the owning associate producer greenlight stage 1", () => {
    expect(canActOnStage(state(), { userId: "ap", role: "ASSOCIATE_PRODUCER", ownsCategory: true })).toBe(true);
    expect(canActOnStage(state(), { userId: "ap", role: "ASSOCIATE_PRODUCER", ownsCategory: false })).toBe(false);
  });

  it("does not let an associate producer greenlight a package they are a member of", () => {
    expect(
      canActOnStage(state(), {
        userId: "ap",
        role: "ASSOCIATE_PRODUCER",
        ownsCategory: true,
        isPackageMember: true
      })
    ).toBe(false);
    expect(
      applyDecision(
        state(),
        { userId: "ap", role: "ASSOCIATE_PRODUCER", ownsCategory: true, isPackageMember: true },
        true,
        { latestInitialCutVersion: 2 }
      )
    ).toEqual({ type: "FORBIDDEN" });
  });

  it("does not let unassigned executives act at stage 1", () => {
    expect(
      canActOnStage(state(), { userId: "ep1", role: "EXECUTIVE_PRODUCER" })
    ).toBe(false);
    expect(
      canActOnStage(state(), { userId: "ep1", role: "EXECUTIVE_PRODUCER", ownsCategory: false })
    ).toBe(false);
    expect(
      applyDecision(state(), { userId: "ep1", role: "EXECUTIVE_PRODUCER" }, true)
    ).toEqual({ type: "FORBIDDEN" });
  });

  it("lets the assigned executive act at stage 1 like an assigned AP", () => {
    const assignedEp = { userId: "ep1", role: "EXECUTIVE_PRODUCER" as const, ownsCategory: true };
    const assignedAdmin = { userId: "admin", role: "SUPER_ADMIN" as const, ownsCategory: true };

    expect(canActOnStage(state(), assignedEp)).toBe(true);
    expect(canActOnStage(state(), assignedAdmin)).toBe(true);
    expect(
      applyDecision(state(), assignedEp, true, { latestInitialCutVersion: 2 })
    ).toEqual({ type: "ADVANCE", stage: "ADVISER_REVIEW" });
  });

  it("lets the assigned executive still sign off at stage 3", () => {
    expect(
      canActOnStage(state({ stage: "EXECUTIVE_REVIEW" }), {
        userId: "ep1",
        role: "EXECUTIVE_PRODUCER",
        ownsCategory: true
      })
    ).toBe(true);
  });

  it("does not let the assigned executive skip stage 2", () => {
    expect(
      canActOnStage(state({ stage: "ADVISER_REVIEW" }), {
        userId: "ep1",
        role: "EXECUTIVE_PRODUCER",
        ownsCategory: true
      })
    ).toBe(false);
  });

  it("does not let an associate producer act at stage 2 or 3", () => {
    const actor = { userId: "ap", role: "ASSOCIATE_PRODUCER" as const, ownsCategory: true };

    expect(canActOnStage(state({ stage: "ADVISER_REVIEW" }), actor)).toBe(false);
    expect(canActOnStage(state({ stage: "EXECUTIVE_REVIEW" }), actor)).toBe(false);
  });

  it("lets the adviser clear stage 2 but never stage 3", () => {
    const adviser = { userId: "adviser", role: "ADVISER" as const };

    expect(canActOnStage(state({ stage: "ADVISER_REVIEW" }), adviser)).toBe(true);
    expect(canActOnStage(state({ stage: "EXECUTIVE_REVIEW" }), adviser)).toBe(false);
  });

  it("does not let executives advance stage 2", () => {
    expect(
      canActOnStage(state({ stage: "ADVISER_REVIEW" }), { userId: "ep1", role: "EXECUTIVE_PRODUCER" })
    ).toBe(false);
    expect(
      applyDecision(state({ stage: "ADVISER_REVIEW" }), { userId: "ep1", role: "EXECUTIVE_PRODUCER" }, true)
    ).toEqual({ type: "FORBIDDEN" });
  });

  it("holds stage 1 on v1 until a revised cut exists", () => {
    expect(
      applyDecision(
        state(),
        { userId: "ap", role: "ASSOCIATE_PRODUCER", ownsCategory: true },
        true,
        { latestInitialCutVersion: 1 }
      )
    ).toEqual({ type: "HOLD_FOR_REVISION", stage: "ASSOCIATE_REVIEW" });

    expect(
      applyDecision(
        state(),
        { userId: "ap", role: "ASSOCIATE_PRODUCER", ownsCategory: true },
        true,
        { latestInitialCutVersion: 2 }
      )
    ).toEqual({ type: "ADVANCE", stage: "ADVISER_REVIEW" });

    expect(
      applyDecision(
        state(),
        { userId: "ap", role: "ASSOCIATE_PRODUCER", ownsCategory: true },
        true,
        { awaitingRevisedInitialCut: true, latestInitialCutVersion: 1 }
      )
    ).toEqual({ type: "FORBIDDEN" });
  });

  it("lets the Stage 1 owner approve anyway only while awaiting a revised upload", () => {
    const ap = { userId: "ap", role: "ASSOCIATE_PRODUCER" as const, ownsCategory: true };

    expect(canApproveAnyway(state(), ap, true)).toBe(true);
    expect(canApproveAnyway(state(), ap, false)).toBe(false);
    expect(canApproveAnyway(state({ stage: "ADVISER_REVIEW" }), ap, true)).toBe(false);
    expect(canApproveAnyway(state(), { ...ap, ownsCategory: false }, true)).toBe(false);
    expect(canApproveAnyway(state(), { ...ap, isPackageMember: true }, true)).toBe(false);
    expect(
      canApproveAnyway(state(), { userId: "aep", role: "EXECUTIVE_PRODUCER", ownsCategory: true }, true)
    ).toBe(true);
    expect(canApproveAnyway(state(), { userId: "adviser", role: "ADVISER" }, true)).toBe(false);
  });

  it("requires two executive sign-offs to reach approved", () => {
    const first = applyDecision(state({ stage: "EXECUTIVE_REVIEW" }), {
      userId: "ep1",
      role: "EXECUTIVE_PRODUCER"
    }, true);

    expect(first).toEqual({ type: "AWAIT_SIGNOFFS", stage: "EXECUTIVE_REVIEW", remaining: 1 });

    const second = applyDecision(
      state({
        stage: "EXECUTIVE_REVIEW",
        signoffs: [{ userId: "ep1", stage: "EXECUTIVE_REVIEW", approved: true }]
      }),
      { userId: "ep2", role: "EXECUTIVE_PRODUCER" },
      true
    );

    expect(second).toEqual({ type: "ADVANCE", stage: "APPROVED" });
  });

  it("does not let the same executive sign off twice", () => {
    const repeat = applyDecision(
      state({
        stage: "EXECUTIVE_REVIEW",
        signoffs: [{ userId: "ep1", stage: "EXECUTIVE_REVIEW", approved: true }]
      }),
      { userId: "ep1", role: "EXECUTIVE_PRODUCER" },
      true
    );

    expect(repeat).toEqual({ type: "AWAIT_SIGNOFFS", stage: "EXECUTIVE_REVIEW", remaining: 1 });
  });

  it("requires all three executives for controversial packages", () => {
    expect(requiredExecutiveSignoffs(false)).toBe(2);
    expect(requiredExecutiveSignoffs(true)).toBe(3);

    const twoOfThree = state({
      stage: "EXECUTIVE_REVIEW",
      controversial: true,
      signoffs: [
        { userId: "ep1", stage: "EXECUTIVE_REVIEW", approved: true },
        { userId: "ep2", stage: "EXECUTIVE_REVIEW", approved: true }
      ]
    });

    expect(remainingExecutiveSignoffs(twoOfThree)).toBe(1);
  });

  it("sends a denied package back to draft from any stage", () => {
    expect(
      applyDecision(state({ stage: "EXECUTIVE_REVIEW" }), { userId: "ep1", role: "EXECUTIVE_PRODUCER" }, false)
    ).toEqual({ type: "SEND_BACK", stage: "DRAFT" });

    expect(
      applyDecision(state(), { userId: "ap", role: "ASSOCIATE_PRODUCER", ownsCategory: true }, false)
    ).toEqual({ type: "SEND_BACK", stage: "DRAFT" });
  });

  it("refuses decisions from actors who cannot act on the stage", () => {
    expect(
      applyDecision(state({ stage: "EXECUTIVE_REVIEW" }), { userId: "adviser", role: "ADVISER" }, true)
    ).toEqual({ type: "FORBIDDEN" });

    expect(applyDecision(state(), { userId: "nobody", role: null }, true)).toEqual({ type: "FORBIDDEN" });
  });

  it("unlocks final cut on approval but does not treat that as airable", () => {
    expect(isApprovedForFinalCut(state({ stage: "EXECUTIVE_REVIEW" }))).toBe(false);
    expect(isApprovedForFinalCut(state({ stage: "APPROVED" }))).toBe(true);
    expect(canPublish(state({ stage: "APPROVED" }))).toBe(false);
  });

  // Approval is anchored to the package, not to a cut, because the chain spans
  // three artifacts: initial cut, revised initial cut, and final cut. A single
  // package therefore keeps one continuous chain across all of them.
  it("keeps one chain across the initial and final cut", () => {
    const afterAdviser = state({
      stage: "EXECUTIVE_REVIEW",
      signoffs: [
        { userId: "ap", stage: "ASSOCIATE_REVIEW", approved: true },
        { userId: "adviser", stage: "ADVISER_REVIEW", approved: true }
      ]
    });

    // Earlier-stage sign-offs do not count toward the executive quorum.
    expect(remainingExecutiveSignoffs(afterAdviser)).toBe(2);

    const oneEp = applyDecision(afterAdviser, { userId: "ep1", role: "EXECUTIVE_PRODUCER" }, true);
    expect(oneEp).toEqual({ type: "AWAIT_SIGNOFFS", stage: "EXECUTIVE_REVIEW", remaining: 1 });
  });
});
