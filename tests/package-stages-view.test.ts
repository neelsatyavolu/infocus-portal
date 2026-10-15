import { describe, expect, it } from "vitest";
import type {
  FinalCutGradeCardData,
  FinalCutMemberGradeData
} from "@/components/package-cycle/final-cut-grade-card";
import { finalCutPrimaryAction } from "@/components/package-cycle/final-cut-producer-view";
import { draftFrom, draftIsDirty, lateStatus, scoresFromDraft } from "@/components/package-stages/grade-helpers";
import {
  approvalPathSteps,
  lockedStageSentence,
  mediaStatusLabel,
  producerProgressLine,
  studentNextStep
} from "@/components/package-stages/stage-status";
import type { StageView } from "@/components/package-stages/types";
import { nextSeenStatuses, seenStatusesKey } from "@/components/package-stages/use-stage-changes";
import { unreadInThread } from "@/components/package-stages/use-stage-comments";

function member(overrides: Partial<FinalCutMemberGradeData> = {}): FinalCutMemberGradeData {
  return {
    userId: "abby",
    name: "Abby",
    email: "abby@example.edu",
    myQuality: null,
    myEffort: null,
    locked: false,
    complete: false,
    pendingCount: 2,
    qualityAverage: null,
    effortAverage: null,
    average: null,
    afterRevisionCap: null,
    revisionCapped: false,
    officialPoints: null,
    revisionCount: 0,
    secondRevisionEligible: false,
    daysLate: 0,
    penaltyMultiplier: 0,
    automaticPenaltyMultiplier: 0,
    latePenaltyPercent: null,
    graderScores: [],
    ...overrides
  };
}

function grade(overrides: Partial<FinalCutGradeCardData> = {}): FinalCutGradeCardData {
  return {
    canGrade: true,
    complete: false,
    viewerUserId: "sage",
    deadlineAt: "2026-10-01T12:00:00.000Z",
    turnedInAt: "2026-09-30T12:00:00.000Z",
    extensionDays: 0,
    daysLate: 0,
    penaltyMultiplier: 0,
    blocksSecondRevision: false,
    secondRevisionEligible: false,
    feedback: "",
    published: false,
    publishedAt: null,
    members: [member()],
    graders: [],
    ...overrides
  };
}

function view(overrides: Partial<StageView> = {}): StageView {
  return {
    empty: false,
    slug: "final-cut",
    isProducer: true,
    media: [],
    row: {
      id: "row-1",
      cycleNumber: 3,
      groupTopic: "Airport day",
      proofOfContact: true,
      aRollBRoll: true,
      initialCut: true,
      awaitingRevisedInitialCut: false,
      queuedForAirAt: null,
      approvalStage: "APPROVED",
      members: []
    },
    ...overrides
  };
}

const clip = {
  id: "media-1",
  title: "Clip",
  rollKind: null,
  projectId: "project-1",
  versionId: "version-1",
  versionNumber: 1,
  status: "READY",
  thumbnailUrl: null,
  playbackUrl: null,
  commentCount: 0
};

describe("approvalPathSteps", () => {
  const base = { needsRevisions: false, awaitingRevisedInitialCut: false };

  it("leaves every step upcoming before a cut is uploaded", () => {
    const steps = approvalPathSteps({ ...base, approvalStage: "ADVISER_REVIEW", hasMedia: false });
    expect(steps.map((step) => step.state)).toEqual(["upcoming", "upcoming", "upcoming"]);
  });

  it("marks earlier steps done and the current one reviewing", () => {
    const steps = approvalPathSteps({ ...base, approvalStage: "ADVISER_REVIEW", hasMedia: true });
    expect(steps.map((step) => step.state)).toEqual(["done", "current", "upcoming"]);
    expect(steps[1]?.stateLabel).toBe("Reviewing");
  });

  it("shows revisions on the current step", () => {
    const steps = approvalPathSteps({ ...base, approvalStage: "ASSOCIATE_REVIEW", hasMedia: true, needsRevisions: true });
    expect(steps[0]).toMatchObject({ state: "current", stateLabel: "Needs revisions", tone: "danger" });
  });

  it("counts executive sign-offs left at Stage 3", () => {
    const steps = approvalPathSteps({
      ...base,
      approvalStage: "EXECUTIVE_REVIEW",
      hasMedia: true,
      remainingExecutiveSignoffs: 1
    });
    expect(steps[2]?.state).toBe("current");
    expect(steps[2]?.stateLabel).toMatch(/1/);
  });

  it("marks all three done once approved", () => {
    const steps = approvalPathSteps({ ...base, approvalStage: "APPROVED", hasMedia: true });
    expect(steps.every((step) => step.state === "done")).toBe(true);
  });
});

describe("studentNextStep", () => {
  it("names the stage that unlocks a locked one", () => {
    expect(studentNextStep("initial-cut", "locked")).toBe(lockedStageSentence("initial-cut"));
    expect(lockedStageSentence("a-roll")).toBe("Unlocks when Brainstorming is approved.");
  });

  it("says what to do on A-roll", () => {
    expect(studentNextStep("a-roll", "needs-revisions")).toMatch(/upload new clips/);
    expect(studentNextStep("a-roll", "pending")).toMatch(/Upload your A-roll/);
  });

  it("does not repeat the Initial Cut progress label while a reviewer has it", () => {
    for (const status of ["submitted", "stage-2", "stage-3"] as const) {
      expect(studentNextStep("initial-cut", status)).toBe(
        "Nothing to do until a reviewer asks for changes. Feedback shows up here."
      );
    }
  });

  it("points an approved Initial Cut at the Final Cut until one is uploaded", () => {
    expect(studentNextStep("initial-cut", "approved")).toMatch(/upload your Final Cut/);
    expect(studentNextStep("initial-cut", "approved", { hasFinalCut: true })).toBe(
      "Approved. Nothing more to do for this stage."
    );
  });
});

describe("producerProgressLine", () => {
  it("is empty before anything is uploaded (the empty state says it)", () => {
    expect(producerProgressLine("final-cut", "pending", view(), null)).toBeNull();
    expect(producerProgressLine("a-roll", "pending", view({ slug: "a-roll" }), null)).toBeNull();
  });

  it("says nothing once A-roll/B-roll is approved (the stage bar says it)", () => {
    expect(producerProgressLine("a-roll", "approved", view({ slug: "a-roll", media: [clip] }), null)).toBeNull();
  });

  it("describes the queue on Final Cut", () => {
    expect(producerProgressLine("final-cut", "submitted", view({ media: [clip] }), null)).toBe(
      "Send it when it is ready to air."
    );
  });

  it("uses the approval progress on Initial Cut", () => {
    expect(producerProgressLine("initial-cut", "stage-2", view({ media: [clip] }), "Waiting for the adviser")).toBe(
      "Waiting for the adviser"
    );
  });
});

describe("mediaStatusLabel", () => {
  it("humanizes the raw media status", () => {
    expect(mediaStatusLabel("READY")).toBe("Ready");
    expect(mediaStatusLabel("PROCESSING")).toBe("Processing");
    expect(mediaStatusLabel("NEEDS_TRANSCODE")).toBe("Needs transcode");
  });
});

describe("finalCutPrimaryAction", () => {
  const base = { canGrade: false, canSaveScores: false, hasFinalCut: true, queued: false, gradesReadyToPublish: false };

  it("makes Send to queue primary for non-graders until queued", () => {
    expect(finalCutPrimaryAction(base)).toBe("queue");
    expect(finalCutPrimaryAction({ ...base, queued: true })).toBeNull();
  });

  it("makes Save my scores primary for graders, then Publish once every grade is in", () => {
    expect(finalCutPrimaryAction({ ...base, canGrade: true, canSaveScores: true })).toBe("save");
    expect(finalCutPrimaryAction({ ...base, canGrade: true, canSaveScores: true, gradesReadyToPublish: true })).toBe(
      "publish"
    );
  });
});

describe("grade drafts", () => {
  it("is dirty only when an unlocked member's typed scores differ", () => {
    const members = [member({ myQuality: 20, myEffort: 21 }), member({ userId: "otto", name: "Otto", locked: true })];
    const draft = draftFrom(members);
    expect(draftIsDirty(members, draft)).toBe(false);
    expect(draftIsDirty(members, { ...draft, abby: { quality: "22", effort: "21" } })).toBe(true);
    expect(draftIsDirty(members, { ...draft, otto: { quality: "10", effort: "10" } })).toBe(false);
  });

  it("turns filled rows into scores and names the member when a row is half filled", () => {
    const members = [member(), member({ userId: "otto", name: "Otto" })];
    expect(scoresFromDraft(members, { abby: { quality: "20", effort: "21" }, otto: { quality: "", effort: "" } })).toEqual({
      scores: [{ memberUserId: "abby", qualityPoints: 20, effortPoints: 21 }]
    });
    expect(scoresFromDraft(members, { abby: { quality: "20", effort: "" } })).toEqual({
      error: "Enter both quality and effort for Abby."
    });
    expect(scoresFromDraft(members, { abby: { quality: "26", effort: "1" } })).toEqual({
      error: "Scores for Abby must be between 0 and 25."
    });
    expect(scoresFromDraft(members, {})).toEqual({ error: "Enter at least one member's scores." });
  });
});

describe("lateStatus", () => {
  it("reports not submitted, on time and late", () => {
    expect(lateStatus(grade({ turnedInAt: null })).label).toBe("Not submitted");
    expect(lateStatus(grade()).label).toBe("On time");
    const late = lateStatus(grade({ daysLate: 2, penaltyMultiplier: 0.2 }));
    expect(late).toMatchObject({ label: "Late · 20% off", tone: "warn" });
    expect(lateStatus(grade({ daysLate: 5, penaltyMultiplier: 0.3, blocksSecondRevision: true })).tone).toBe("danger");
  });
});

describe("unreadInThread", () => {
  const all = [
    { id: "n4", clipId: "media-1" },
    { id: "n3", clipId: null },
    { id: "n2", clipId: null },
    { id: "n1", clipId: null }
  ];

  it("marks only the unread notes that are in the group thread and counts the clip ones", () => {
    expect(unreadInThread(all, 2)).toEqual({ threadIds: ["n3"], onClips: 1 });
  });

  it("picks one clip's unread notes in clip mode", () => {
    expect(unreadInThread(all, 2, "media-1")).toEqual({ threadIds: ["n4"], onClips: 0 });
  });

  it("marks nothing when everything is read", () => {
    expect(unreadInThread(all, 0)).toEqual({ threadIds: [], onClips: 0 });
  });
});

describe("nextSeenStatuses", () => {
  it("records a first visit quietly", () => {
    const result = nextSeenStatuses({}, { "a-roll": "approved" }, null);
    expect(result.flagged.size).toBe(0);
    expect(result.seen["a-roll"]).toBe("approved");
  });

  it("flags a review result on another stage until it is opened", () => {
    const flagged = nextSeenStatuses({ "a-roll": "submitted" }, { "a-roll": "approved" }, "initial-cut");
    expect([...flagged.flagged]).toEqual(["a-roll"]);
    expect(flagged.seen["a-roll"]).toBe("submitted");
    const opened = nextSeenStatuses(flagged.seen, { "a-roll": "approved" }, "a-roll");
    expect(opened.flagged.size).toBe(0);
    expect(opened.seen["a-roll"]).toBe("approved");
  });

  it("records the viewer's own changes without a flag", () => {
    const result = nextSeenStatuses({ "a-roll": "pending" }, { "a-roll": "submitted" }, null);
    expect(result.flagged.size).toBe(0);
    expect(result.seen["a-roll"]).toBe("submitted");
  });
});

describe("seenStatusesKey", () => {
  it("keeps each viewer's record apart without storing the email", () => {
    const abby = seenStatusesKey("abby@example.edu");
    const otto = seenStatusesKey("otto@example.edu");
    expect(abby).not.toBe(otto);
    expect(abby).not.toContain("abby");
    expect(seenStatusesKey(" Abby@Example.edu ")).toBe(abby);
  });

  it("falls back to the shared key when the viewer is unknown", () => {
    expect(seenStatusesKey(null)).toBe(seenStatusesKey(""));
  });
});
