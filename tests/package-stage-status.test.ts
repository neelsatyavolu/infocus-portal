import { describe, expect, it } from "vitest";
import {
  allCycleStageStatuses,
  aRollUploadIsNew,
  brainstormNeedsChanges,
  cycleStageStatus,
  earlyStageNeedsChanges,
  emptyCycleStageStatusInput,
  stageFeedbackNeedsChanges
} from "@/src/lib/package-stage-status";

describe("cycleStageStatus", () => {
  it("highlights only footage uploaded after the latest revision request until approval", () => {
    const feedback = new Date("2026-09-11T18:00:00Z");
    const upload = new Date("2026-09-11T18:05:00Z");
    expect(aRollUploadIsNew(false, feedback, upload)).toBe(true);
    expect(aRollUploadIsNew(false, upload, feedback)).toBe(false);
    expect(aRollUploadIsNew(false, feedback, feedback)).toBe(false);
    expect(aRollUploadIsNew(true, feedback, upload)).toBe(false);
    expect(aRollUploadIsNew(false, null, upload)).toBe(false);
    expect(aRollUploadIsNew(false, feedback, null)).toBe(false);
  });

  it("marks brainstorming approved, submitted, or pending", () => {
    expect(cycleStageStatus("brainstorming", emptyCycleStageStatusInput())).toBe("pending");
    expect(
      cycleStageStatus("brainstorming", {
        ...emptyCycleStageStatusInput(),
        proofCount: 3,
        brainstormDocUrl: "https://docs.google.com/document/d/abc"
      })
    ).toBe("submitted");
    expect(
      cycleStageStatus("brainstorming", { ...emptyCycleStageStatusInput(), proofOfContact: true })
    ).toBe("approved");
  });

  it("treats producer brainstorming feedback without approval as REVISIONS", () => {
    const ready = {
      ...emptyCycleStageStatusInput(),
      proofCount: 3,
      brainstormDocUrl: "https://docs.google.com/document/d/abc"
    };
    expect(cycleStageStatus("brainstorming", { ...ready, brainstormNeedsChanges: true })).toBe("needs-revisions");
    expect(
      cycleStageStatus("brainstorming", { ...ready, brainstormNeedsChanges: true, proofOfContact: true })
    ).toBe("approved");
    expect(
      cycleStageStatus("brainstorming", { ...emptyCycleStageStatusInput(), brainstormNeedsChanges: true })
    ).toBe("pending");
  });

  it("clears brainstorming revisions on approval or a proof uploaded after the feedback", () => {
    const feedbackAt = new Date("2026-10-08T18:00:00.000Z");
    const before = new Date("2026-10-08T17:00:00.000Z");
    const after = new Date("2026-10-08T18:05:00.000Z");
    const feedback = [{ stage: "brainstorming", createdAt: feedbackAt }];
    const base = { proofOfContact: false, stageComments: feedback, proofOfContacts: [{ updatedAt: before }] };
    expect(brainstormNeedsChanges(base)).toBe(true);
    expect(brainstormNeedsChanges({ ...base, proofOfContact: true })).toBe(false);
    expect(brainstormNeedsChanges({ ...base, proofOfContacts: [{ updatedAt: before }, { updatedAt: after }] })).toBe(false);
    expect(brainstormNeedsChanges({ ...base, stageComments: [] })).toBe(false);
    expect(brainstormNeedsChanges({ ...base, stageComments: [{ stage: "a-roll", createdAt: feedbackAt }] })).toBe(false);
  });

  it("keeps brainstorming and a-roll feedback separate", () => {
    const at = new Date("2026-10-08T18:00:00.000Z");
    expect(
      earlyStageNeedsChanges({
        proofOfContact: true,
        aRollBRoll: false,
        stageComments: [{ stage: "a-roll", createdAt: at }],
        proofOfContacts: [],
        stageMedia: [{ createdAt: new Date("2026-10-08T17:00:00.000Z") }]
      })
    ).toEqual({ brainstormNeedsChanges: false, aRollNeedsChanges: true });
  });

  it("locks later tabs until the previous stage is approved", () => {
    const locked = emptyCycleStageStatusInput();
    expect(cycleStageStatus("a-roll", locked)).toBe("locked");
    expect(cycleStageStatus("initial-cut", locked)).toBe("locked");
    expect(cycleStageStatus("final-cut", locked)).toBe("locked");
  });

  it("marks a-roll submitted after upload and approved after producer check-in", () => {
    const unlocked = { ...emptyCycleStageStatusInput(), proofOfContact: true };
    expect(cycleStageStatus("a-roll", unlocked)).toBe("pending");
    expect(cycleStageStatus("a-roll", { ...unlocked, aRollHasMedia: true })).toBe("submitted");
    expect(cycleStageStatus("a-roll", { ...unlocked, aRollBRoll: true })).toBe("approved");
  });

  it("treats assigned-producer a-roll feedback as REVISIONS until they approve", () => {
    const unlocked = { ...emptyCycleStageStatusInput(), proofOfContact: true, aRollHasMedia: true };
    expect(stageFeedbackNeedsChanges(false, true)).toBe(true);
    expect(stageFeedbackNeedsChanges(true, true)).toBe(false);
    expect(cycleStageStatus("a-roll", { ...unlocked, aRollNeedsChanges: true })).toBe("needs-revisions");
    expect(cycleStageStatus("a-roll", { ...unlocked, aRollNeedsChanges: true, aRollBRoll: true })).toBe("approved");
  });

  it("returns a-roll to pending review after students upload past producer feedback", () => {
    const feedbackAt = new Date("2026-09-02T18:00:00.000Z");
    const footageAt = new Date("2026-09-02T18:05:00.000Z");
    expect(stageFeedbackNeedsChanges(false, true, feedbackAt, footageAt)).toBe(false);
    expect(stageFeedbackNeedsChanges(false, true, footageAt, feedbackAt)).toBe(true);
    expect(stageFeedbackNeedsChanges(false, true, feedbackAt, feedbackAt)).toBe(true);
    const unlocked = { ...emptyCycleStageStatusInput(), proofOfContact: true, aRollHasMedia: true };
    expect(cycleStageStatus("a-roll", { ...unlocked, aRollNeedsChanges: false })).toBe("submitted");
  });

  it("treats a requested initial-cut revision as REVISIONS", () => {
    const unlocked = {
      ...emptyCycleStageStatusInput(),
      proofOfContact: true,
      aRollBRoll: true,
      initialCutHasMedia: true,
      approvalStage: "ASSOCIATE_REVIEW"
    };
    expect(cycleStageStatus("initial-cut", unlocked)).toBe("submitted");
    expect(cycleStageStatus("initial-cut", { ...unlocked, initialCutNeedsRevisions: true })).toBe("needs-revisions");
    expect(cycleStageStatus("initial-cut", { ...unlocked, awaitingRevisedInitialCut: true, initialCut: true })).toBe(
      "stage-1-approved"
    );
    expect(cycleStageStatus("initial-cut", { ...unlocked, approvalStage: "DRAFT" })).toBe("needs-revisions");
    expect(
      cycleStageStatus("initial-cut", {
        ...unlocked,
        initialCut: true,
        initialCutNeedsRevisions: false,
        awaitingRevisedInitialCut: false,
        approvalStage: "ASSOCIATE_REVIEW"
      })
    ).toBe("submitted");
    expect(cycleStageStatus("initial-cut", { ...unlocked, approvalStage: "ADVISER_REVIEW" })).toBe("stage-2");
    expect(cycleStageStatus("initial-cut", { ...unlocked, approvalStage: "EXECUTIVE_REVIEW" })).toBe("stage-3");
  });

  it("keeps student final-cut pills approved after send-to-queue", () => {
    const row = {
      ...emptyCycleStageStatusInput(),
      proofOfContact: true,
      aRollBRoll: true,
      approvalStage: "APPROVED",
      finalCutHasMedia: true,
      queuedForAir: true
    };
    expect(cycleStageStatus("final-cut", row)).toBe("approved");
    expect(allCycleStageStatuses(row)["final-cut"]).toBe("approved");
  });

  it("marks final cut queued for producers after send-to-queue", () => {
    const row = {
      ...emptyCycleStageStatusInput(),
      proofOfContact: true,
      aRollBRoll: true,
      approvalStage: "APPROVED",
      finalCutHasMedia: true,
      queuedForAir: true
    };
    expect(cycleStageStatus("final-cut", row, { showQueued: true })).toBe("queued");
    expect(allCycleStageStatuses(row, { showQueued: true })["final-cut"]).toBe("queued");
  });
});
