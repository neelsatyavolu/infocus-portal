import { describe, expect, it } from "vitest";
import { applyLatePenalty, calculateLatePenalty, effectiveDeadline } from "@/src/lib/package-extensions";
import { studentCanUpload, studentStageUnlocked } from "@/src/lib/package-cycle-gates";
import { applyInitialCutUpload, groupFolderName, initialCutVersionTitle } from "@/src/lib/package-cut-transitions";
import {
  approvalProgressLabel,
  approvalStageHandoff,
  approvalStagePillLabel,
  executiveWaitLabel,
  executiveWaitPill
} from "@/src/lib/package-approval";
import { officialFinalCutPoints, PACKAGE_ADVISER_EMAIL, reviewMailRecipients } from "@/src/lib/package-review-mail";
import { buildCycleStageNasPath } from "@/src/lib/nas-storage";
import { parseClipComment, wrapClipComment } from "@/src/lib/package-clip-comments";
import { parseRollTitle, titledWithRollKind } from "@/src/lib/package-roll-kind";

describe("student stage gates", () => {
  it("unlocks tabs in order", () => {
    const locked = { proofOfContact: false, aRollBRoll: false };
    expect(studentStageUnlocked("a-roll", locked, null)).toBe(false);
    expect(studentStageUnlocked("initial-cut", { proofOfContact: true, aRollBRoll: false }, null)).toBe(false);
    expect(studentStageUnlocked("a-roll", { proofOfContact: true, aRollBRoll: false }, null)).toBe(true);
    expect(studentStageUnlocked("initial-cut", { proofOfContact: true, aRollBRoll: true }, null)).toBe(true);
    expect(studentStageUnlocked("final-cut", { proofOfContact: true, aRollBRoll: true }, { stage: "EXECUTIVE_REVIEW" })).toBe(
      false
    );
    expect(studentStageUnlocked("final-cut", { proofOfContact: true, aRollBRoll: true }, { stage: "APPROVED" })).toBe(true);
  });

  it("blocks a-roll uploads after approve and a second final cut", () => {
    expect(studentCanUpload("a-roll", { proofOfContact: true, aRollBRoll: false }, null)).toBe(true);
    expect(studentCanUpload("a-roll", { proofOfContact: true, aRollBRoll: true }, null)).toBe(false);
    expect(
      studentCanUpload("final-cut", { proofOfContact: true, aRollBRoll: true, finalCutMediaItemId: "m1" }, { stage: "APPROVED" })
    ).toBe(false);
    expect(
      studentCanUpload(
        "final-cut",
        { proofOfContact: true, aRollBRoll: true, finalCutMediaItemId: "m1" },
        { stage: "APPROVED" },
        { allowSecondFinalCut: true }
      )
    ).toBe(true);
  });
});

describe("initial cut version title", () => {
  it("names each upload Initial Cut Version N", () => {
    expect(initialCutVersionTitle(1)).toBe("Initial Cut Version 1");
    expect(initialCutVersionTitle(2)).toBe("Initial Cut Version 2");
    expect(initialCutVersionTitle(0)).toBe("Initial Cut Version 1");
  });
});

describe("approval stage pill", () => {
  it("maps the approval chain to Stage 1/2/3 pills", () => {
    expect(approvalStagePillLabel("DRAFT")).toBe("DRAFT");
    expect(approvalStagePillLabel("ASSOCIATE_REVIEW")).toBe("STAGE 1");
    expect(approvalStagePillLabel("ADVISER_REVIEW")).toBe("STAGE 2");
    expect(approvalStagePillLabel("EXECUTIVE_REVIEW")).toBe("STAGE 3");
    expect(approvalStagePillLabel("APPROVED")).toBe("FINAL CUT");
    expect(approvalStagePillLabel("nope")).toBeNull();
    expect(approvalStageHandoff("ADVISER_REVIEW")).toMatch(/Stage 2/);
    expect(approvalStageHandoff("ADVISER_REVIEW")).toMatch(/Not your stage/);
    expect(executiveWaitLabel(2)).toBe("Waiting for 2 more exec approvals");
    expect(executiveWaitLabel(1)).toBe("Waiting for 1 more exec approval");
    expect(executiveWaitPill(2)).toBe("2 execs left");
    expect(executiveWaitPill(1)).toBe("1 exec left");
    expect(approvalProgressLabel("ADVISER_REVIEW")).toBe("Waiting for the adviser (Stage 2)");
    expect(approvalProgressLabel("EXECUTIVE_REVIEW", 1)).toBe("Waiting for 1 more exec approval");
  });
});

describe("initial cut upload transitions", () => {
  it("sends v1 to associate review", () => {
    expect(applyInitialCutUpload({ currentStage: "DRAFT", awaitingRevisedInitialCut: false, nextVersionNumber: 1 })).toEqual({
      ok: true,
      nextStage: "ASSOCIATE_REVIEW",
      clearAwaiting: true,
      email: "ap"
    });
  });

  it("moves to adviser only after stage 1 and v2", () => {
    expect(
      applyInitialCutUpload({ currentStage: "ASSOCIATE_REVIEW", awaitingRevisedInitialCut: true, nextVersionNumber: 2 })
    ).toEqual({ ok: true, nextStage: "ADVISER_REVIEW", clearAwaiting: true, email: "adviser" });
    expect(
      applyInitialCutUpload({ currentStage: "ASSOCIATE_REVIEW", awaitingRevisedInitialCut: false, nextVersionNumber: 2 })
    ).toEqual({ ok: true, nextStage: "ASSOCIATE_REVIEW", clearAwaiting: false, email: "ap" });
  });

  it("keeps a stage 2 re-upload with the adviser", () => {
    expect(
      applyInitialCutUpload({ currentStage: "ADVISER_REVIEW", awaitingRevisedInitialCut: false, nextVersionNumber: 3 })
    ).toEqual({ ok: true, nextStage: "ADVISER_REVIEW", clearAwaiting: false, email: "adviser" });
  });

  it("emails execs on any initial cut uploaded during stage 3", () => {
    expect(
      applyInitialCutUpload({ currentStage: "EXECUTIVE_REVIEW", awaitingRevisedInitialCut: false, nextVersionNumber: 3 })
    ).toEqual({ ok: true, nextStage: "EXECUTIVE_REVIEW", clearAwaiting: false, email: "execs" });
  });

  it("rejects further initial cuts after approved", () => {
    expect(applyInitialCutUpload({ currentStage: "APPROVED", awaitingRevisedInitialCut: false, nextVersionNumber: 3 })).toEqual({
      ok: false,
      status: 409
    });
  });

  it("returns a denied package to associate review on the next upload", () => {
    expect(applyInitialCutUpload({ currentStage: "DRAFT", awaitingRevisedInitialCut: false, nextVersionNumber: 3 })).toEqual({
      ok: true,
      nextStage: "ASSOCIATE_REVIEW",
      clearAwaiting: true,
      email: "ap"
    });
  });
});

describe("review mail recipients", () => {
  it("emails the assigned AP, then the category owner", () => {
    expect(reviewMailRecipients("ap", { assignedProducerEmail: "ap@pausd.org" })).toEqual(["ap@pausd.org"]);
    expect(reviewMailRecipients("ap", { categoryProducerEmail: "cat@pausd.org" })).toEqual(["cat@pausd.org"]);
    expect(reviewMailRecipients("ap", {})).toEqual([]);
  });

  it("emails the adviser and all execs except the adviser", () => {
    expect(reviewMailRecipients("adviser", {})).toEqual([PACKAGE_ADVISER_EMAIL]);
    expect(
      reviewMailRecipients("execs", {
        executiveProducerEmails: ["ep1@pausd.org", PACKAGE_ADVISER_EMAIL!, "ep1@pausd.org"]
      })
    ).toEqual(["ep1@pausd.org"]);
  });
});

describe("final cut official score", () => {
  it("deducts 20 or 30 from the true score without double applying", () => {
    const deadline = new Date("2026-09-30T00:00:00.000Z");
    const late = calculateLatePenalty(deadline, new Date("2026-10-02T00:00:00.000Z"));
    const severe = calculateLatePenalty(deadline, new Date("2026-10-20T00:00:00.000Z"));
    expect(officialFinalCutPoints(46, late.penaltyMultiplier)).toBe(applyLatePenalty(46, late));
    expect(officialFinalCutPoints(50, severe.penaltyMultiplier)).toBe(35);
    expect(officialFinalCutPoints(43.7, 0)).toBe(43.7);
    expect(effectiveDeadline(deadline, 3)?.toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });
});

describe("clip feedback prefix", () => {
  it("wraps and unwraps a media id without touching group notes", () => {
    expect(wrapClipComment("abc", "tighten the a-roll")).toBe("[[clip:abc]]\ntighten the a-roll");
    expect(parseClipComment("[[clip:abc]]\ntighten the a-roll")).toEqual({
      mediaItemId: "abc",
      text: "tighten the a-roll"
    });
    expect(parseClipComment("group note")).toEqual({ mediaItemId: null, text: "group note" });
  });
});

describe("a-roll vs b-roll titles", () => {
  it("prefixes and parses roll kind without losing the filename", () => {
    expect(titledWithRollKind("20260114_A741374", "b-roll")).toBe("B-roll · 20260114_A741374");
    expect(parseRollTitle("A-roll · open")).toEqual({ rollKind: "a-roll", displayTitle: "open" });
    expect(parseRollTitle("plain clip")).toEqual({ rollKind: null, displayTitle: "plain clip" });
    expect(parseRollTitle(titledWithRollKind("A-roll · already", "b-roll"))).toEqual({
      rollKind: "b-roll",
      displayTitle: "already"
    });
  });
});

describe("cycle NAS path", () => {
  it("nests files under Package Storage / Cycle N / group / stage", () => {
    expect(
      buildCycleStageNasPath({
        cycleNumber: 1,
        groupName: groupFolderName("Lee-Patel", []),
        stageFolder: "Initial Cut",
        mediaTitle: "cut",
        versionNumber: 2,
        fileName: "open.mp4"
      })
    ).toBe("Package Storage/Cycle 1/Lee-Patel/Initial Cut/open-v2.mp4");
  });
});
