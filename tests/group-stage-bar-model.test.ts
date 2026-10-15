import { describe, expect, it } from "vitest";
import {
  applyFlagOverrides,
  approvalPathSteps,
  contactStatus,
  formatShowDay,
  formatStageDay,
  groupStageCells,
  initialStepStates,
  isWorkspaceSlug,
  pruneFlagOverrides,
  resolveFlag,
  type GroupStageFacts
} from "@/app/(app)/groups/[rowId]/stage-bar-model";
import { isStageWrite } from "@/app/(app)/groups/[rowId]/stage-writes";

const DOC = "https://docs.google.com/document/d/example";

function facts(overrides: Partial<GroupStageFacts> = {}): GroupStageFacts {
  return {
    pitching: false,
    proofOfContact: false,
    aRollBRoll: false,
    finalCut: false,
    approvalStage: "DRAFT",
    rawApprovalStage: "DRAFT",
    proofCount: 0,
    brainstormDocUrl: "",
    brainstormNeedsChanges: false,
    initialCut: false,
    initialCutHasMedia: false,
    awaitingRevisedInitialCut: false,
    initialCutNeedsRevisions: false,
    finalCutHasMedia: false,
    queuedForAir: false,
    queuedForShowDate: null,
    proofsUpdatedAt: null,
    brainstormFeedbackAt: null,
    latestCutAt: null,
    signoffs: [],
    ...overrides
  };
}

function cell(cells: ReturnType<typeof groupStageCells>, key: string) {
  const found = cells.find((item) => item.key === key);
  if (!found) throw new Error(`missing cell ${key}`);
  return found;
}

describe("groupStageCells", () => {
  it("marks a fresh group's pitch as pending and dims stages nothing has happened in", () => {
    const cells = groupStageCells("row_1", "pitching", facts());
    expect(cells.map((item) => item.key)).toEqual(["pitching", "brainstorming", "a-roll", "initial", "final-cut"]);
    const pitch = cell(cells, "pitching");
    expect(pitch).toMatchObject({ active: true, pending: true, status: "pending", dimmed: false, segments: ["current"] });
    expect(cell(cells, "brainstorming")).toMatchObject({ status: null, dimmed: true });
    expect(cell(cells, "a-roll")).toMatchObject({ status: null, dimmed: true });
    expect(cell(cells, "initial")).toMatchObject({
      href: "/groups/row_1/initial-stage-1",
      status: null,
      dimmed: true,
      segments: ["upcoming", "upcoming", "upcoming"]
    });
    expect(cell(cells, "final-cut")).toMatchObject({ status: null, dimmed: true });
  });

  it("shows contact SUBMITTED, then REVISIONS with the feedback day", () => {
    const ready = facts({ pitching: true, proofCount: 3, brainstormDocUrl: DOC, proofsUpdatedAt: "2026-10-08T18:00:00Z" });
    const submitted = cell(groupStageCells("row_1", "pitching", ready), "brainstorming");
    expect(submitted).toMatchObject({ status: "submitted", pending: true, meta: "Proofs Oct 8" });
    // The open stage's page states it, so its cell drops the date.
    const open = cell(groupStageCells("row_1", "brainstorming", ready), "brainstorming");
    expect(open).toMatchObject({ status: "submitted", active: true, meta: null });

    const revisions = cell(
      groupStageCells(
        "row_1",
        "pitching",
        { ...ready, brainstormNeedsChanges: true, brainstormFeedbackAt: "2026-10-06T18:00:00Z" }
      ),
      "brainstorming"
    );
    expect(revisions).toMatchObject({ status: "needs-revisions", meta: "Feedback Oct 6", active: false });
  });

  it("does not assume progress is linear", () => {
    // Pitch never marked, but executives toggled Contact and the cut is already at Stage 2.
    const cells = groupStageCells(
      "row_1",
      "pitching",
      facts({
        proofOfContact: true,
        aRollBRoll: true,
        approvalStage: "ADVISER_REVIEW",
        rawApprovalStage: "ADVISER_REVIEW",
        initialCutHasMedia: true
      })
    );
    expect(cell(cells, "pitching").pending).toBe(true);
    expect(cell(cells, "brainstorming")).toMatchObject({ done: true, status: "approved", dimmed: false, segments: ["done"] });
    expect(cell(cells, "initial")).toMatchObject({
      href: "/groups/row_1/initial-stage-2",
      pending: false,
      status: "stage-2",
      dimmed: false,
      segments: ["done", "current", "upcoming"]
    });
  });

  it("keeps a revision request at the stage that asked for it", () => {
    const revision = facts({
      pitching: true,
      proofOfContact: true,
      aRollBRoll: true,
      approvalStage: "EXECUTIVE_REVIEW",
      rawApprovalStage: "DRAFT",
      initialCutHasMedia: true,
      initialCutNeedsRevisions: true,
      latestCutAt: "2026-10-10T18:00:00Z"
    });
    const initial = cell(groupStageCells("row_1", "initial-stage-3", revision), "initial");
    expect(initial).toMatchObject({
      href: "/groups/row_1/initial-stage-3",
      active: true,
      pending: true,
      status: "needs-revisions",
      meta: null,
      segments: ["done", "done", "current"]
    });
    expect(cell(groupStageCells("row_1", "final-cut", revision), "initial").meta).toBe("Cut Oct 10");
  });

  it("uses the student status words: APPROVED IN STAGE 1, then QUEUED for producers", () => {
    const stageOne = facts({
      pitching: true,
      proofOfContact: true,
      aRollBRoll: true,
      approvalStage: "ASSOCIATE_REVIEW",
      rawApprovalStage: "ASSOCIATE_REVIEW",
      initialCutHasMedia: true,
      awaitingRevisedInitialCut: true
    });
    expect(cell(groupStageCells("row_1", "initial-stage-1", stageOne), "initial").status).toBe("stage-1-approved");

    const queued = facts({
      pitching: true,
      proofOfContact: true,
      aRollBRoll: true,
      approvalStage: "APPROVED",
      rawApprovalStage: "APPROVED",
      initialCutHasMedia: true,
      finalCut: true,
      finalCutHasMedia: true,
      queuedForAir: true,
      queuedForShowDate: "2026-10-21"
    });
    const cells = groupStageCells("row_1", "final-cut", queued);
    expect(cell(cells, "initial")).toMatchObject({
      href: "/groups/row_1/initial-stage-3",
      done: true,
      status: "approved",
      segments: ["done", "done", "done"]
    });
    expect(cell(cells, "final-cut")).toMatchObject({ done: true, pending: false, status: "queued", meta: "Airs Oct 21" });
  });

  it("shows a locked Final Cut as a dimmed link with a reason, never a tag", () => {
    const final = cell(groupStageCells("row_1", "pitching", facts({ pitching: true })), "final-cut");
    expect(final).toMatchObject({ status: null, dimmed: true, href: "/groups/row_1/final-cut" });
    expect(final.title).toMatch(/unlock/i);
  });
});

describe("initialStepStates", () => {
  it("waits on Stage 1 until A-roll is approved or a cut is sent for review", () => {
    expect(initialStepStates(facts())).toEqual(["upcoming", "upcoming", "upcoming"]);
    expect(initialStepStates(facts({ aRollBRoll: true }))).toEqual(["current", "upcoming", "upcoming"]);
    expect(initialStepStates(facts({ approvalStage: "ASSOCIATE_REVIEW" }))).toEqual(["current", "upcoming", "upcoming"]);
    expect(initialStepStates(facts({ approvalStage: "APPROVED" }))).toEqual(["done", "done", "done"]);
  });
});

describe("approvalPathSteps", () => {
  const base = facts({
    pitching: true,
    proofOfContact: true,
    aRollBRoll: true,
    approvalStage: "ADVISER_REVIEW",
    rawApprovalStage: "DRAFT",
    initialCutHasMedia: true,
    initialCutNeedsRevisions: true,
    signoffs: [
      { stage: "ASSOCIATE_REVIEW", approved: true, createdAt: "2026-10-03T18:00:00Z" },
      { stage: "ADVISER_REVIEW", approved: false, createdAt: "2026-10-07T18:00:00Z" },
      { stage: "ADVISER_REVIEW", approved: false, createdAt: "2026-10-09T18:00:00Z" }
    ]
  });

  it("dates each decision and tags revisions on the step in progress", () => {
    const steps = approvalPathSteps("row_1", "initial-stage-2", base);
    expect(steps.map((step) => step.state)).toEqual(["done", "current", "upcoming"]);
    expect(steps[0]).toMatchObject({ role: "Producer review", meta: "Approved Oct 3", status: null, active: false });
    expect(steps[1]).toMatchObject({ active: true, status: "needs-revisions", meta: "Sent back Oct 9", href: "/groups/row_1/initial-stage-2" });
    expect(steps[2]).toMatchObject({ role: "Executive sign-off", status: null, meta: null });
  });

  it("opens Stage 1 once A-roll is approved", () => {
    const open = approvalPathSteps("row_1", "initial-stage-1", facts({ aRollBRoll: true }));
    expect(open.map((step) => step.state)).toEqual(["current", "upcoming", "upcoming"]);
    expect(open[0]).toMatchObject({ role: "Producer review", active: true, status: null });
  });
});

describe("optimistic flags", () => {
  it("applies an override only while the server value it replaced is current", () => {
    expect(resolveFlag({ value: true, base: false }, false)).toBe(true);
    expect(resolveFlag({ value: true, base: false }, true)).toBe(true);
    expect(resolveFlag({ value: false, base: false }, true)).toBe(true);
    expect(resolveFlag(undefined, false)).toBe(false);
  });

  it("drops an override once the refreshed server value moves off its base", () => {
    const pending = { proofOfContact: { value: true, base: false } };
    // Refresh not landed yet: nothing to drop, same object back.
    expect(pruneFlagOverrides(pending, { pitching: false, proofOfContact: false })).toBe(pending);
    // Refresh landed: the override is spent, so a later undo elsewhere can't revive it.
    const spent = pruneFlagOverrides(pending, { pitching: false, proofOfContact: true });
    expect(spent).toEqual({});
    expect(resolveFlag(spent.proofOfContact, false)).toBe(false);
  });

  it("flips the contact status to APPROVED before the refresh lands", () => {
    const ready = facts({ pitching: true, proofCount: 3, brainstormDocUrl: DOC });
    const approved = applyFlagOverrides(ready, { proofOfContact: { value: true, base: false } });
    expect(contactStatus(approved)).toBe("approved");
    expect(cell(groupStageCells("row_1", "brainstorming", approved), "brainstorming").done).toBe(true);
  });
});

describe("stage writes", () => {
  const origin = "https://portal.example.edu";
  const write = (path: string, initiatorType = "fetch") => ({ name: `${origin}${path}`, initiatorType });

  it("counts the hosted workspace's writes for this group", () => {
    expect(isStageWrite(write("/api/package-cycle/stage"), origin, "row_1", "initial-stage-1")).toBe(true);
    expect(isStageWrite(write("/api/package-cycle/queue"), origin, "row_1", "initial-stage-1")).toBe(true);
    expect(isStageWrite(write("/api/package-cycle/upload"), origin, "row_1", "initial-stage-1")).toBe(true);
    expect(isStageWrite(write("/api/package-progress/row_1/approval"), origin, "row_1", "initial-stage-1")).toBe(true);
  });

  it("counts a feedback note only on A/B-roll, where it clears the A-roll approval", () => {
    expect(isStageWrite(write("/api/package-cycle/comments"), origin, "row_1", "a-roll")).toBe(true);
    expect(isStageWrite(write("/api/package-cycle/comments"), origin, "row_1", "initial-stage-1")).toBe(false);
    expect(isStageWrite(write("/api/package-cycle/comments"), origin, "row_1", "final-cut")).toBe(false);
    expect(isStageWrite(write("/api/package-cycle/comments"), origin, "row_1", undefined)).toBe(false);
  });

  it("ignores reads, other groups, other origins and non-fetch requests", () => {
    expect(isStageWrite(write("/api/package-cycle/stage?stage=a-roll&rowId=row_1"), origin, "row_1", "initial-stage-1")).toBe(false);
    expect(isStageWrite(write("/api/package-cycle/comments?rowId=row_1&stage=a-roll"), origin, "row_1", "initial-stage-1")).toBe(false);
    expect(isStageWrite(write("/api/package-progress/row_2/approval"), origin, "row_1", "initial-stage-1")).toBe(false);
    expect(isStageWrite(write("/groups/row_1/a-roll"), origin, "row_1", "initial-stage-1")).toBe(false);
    expect(isStageWrite({ name: "https://cdn.example.edu/api/package-cycle/upload", initiatorType: "fetch" }, origin, "row_1", "initial-stage-1")).toBe(false);
    expect(isStageWrite(write("/api/package-cycle/upload", "img"), origin, "row_1", "initial-stage-1")).toBe(false);
    expect(isStageWrite({ name: "not a url", initiatorType: "fetch" }, origin, "row_1", "initial-stage-1")).toBe(false);
  });

  it("watches only the hosted workspace stages", () => {
    expect(isWorkspaceSlug("pitching")).toBe(false);
    expect(isWorkspaceSlug("brainstorming")).toBe(false);
    expect(isWorkspaceSlug("a-roll")).toBe(true);
    expect(isWorkspaceSlug("initial-stage-2")).toBe(true);
    expect(isWorkspaceSlug("final-cut")).toBe(true);
  });
});

describe("dates", () => {
  it("formats days in Pacific time and show dates as written", () => {
    expect(formatStageDay("2026-10-09T05:00:00Z")).toBe("Oct 8");
    expect(formatStageDay(null)).toBeNull();
    expect(formatStageDay("not a date")).toBeNull();
    expect(formatShowDay("2026-10-21")).toBe("Oct 21");
    expect(formatShowDay("10/21")).toBeNull();
  });
});
