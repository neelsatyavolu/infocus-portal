import { describe, expect, it } from "vitest";
import { groupStageCells, type GroupStageFacts } from "@/app/(app)/groups/[rowId]/stage-bar-model";
import { cellSignatures, nextSeenSignatures } from "@/app/(app)/groups/[rowId]/stage-changes";
import type { GroupNavSlug } from "@/src/lib/package-stages";

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

function signatures(slug: GroupNavSlug, value: GroupStageFacts) {
  return cellSignatures(groupStageCells("row_1", slug, value), value);
}

const PROOFS_IN = facts({ pitching: true, proofCount: 3, brainstormDocUrl: DOC, proofsUpdatedAt: "2026-10-08T18:00:00Z" });

describe("group stage changes", () => {
  it("records a first visit quietly", () => {
    const result = nextSeenSignatures({}, signatures("pitching", PROOFS_IN), "pitching");
    expect(result.flagged.size).toBe(0);
    expect(result.seen.brainstorming).toBe("submitted|2026-10-08T18:00:00Z");
  });

  it("flags new proofs until Contact is opened", () => {
    const before = nextSeenSignatures({}, signatures("pitching", facts({ pitching: true })), "pitching").seen;
    const later = nextSeenSignatures(before, signatures("pitching", PROOFS_IN), "pitching");
    expect([...later.flagged]).toEqual(["brainstorming"]);
    // The old record stays, so the dot survives a reload until the stage is opened.
    expect(later.seen.brainstorming).toBe(before.brainstorming);

    const opened = nextSeenSignatures(later.seen, signatures("brainstorming", PROOFS_IN), "brainstorming");
    expect(opened.flagged.size).toBe(0);
    expect(nextSeenSignatures(opened.seen, signatures("pitching", PROOFS_IN), "pitching").flagged.size).toBe(0);
  });

  it("flags a second executive sign-off even though the status word stays STAGE 3", () => {
    const stageThree = facts({
      pitching: true,
      proofOfContact: true,
      aRollBRoll: true,
      initialCut: true,
      initialCutHasMedia: true,
      approvalStage: "EXECUTIVE_REVIEW",
      rawApprovalStage: "EXECUTIVE_REVIEW",
      latestCutAt: "2026-10-08T18:00:00Z",
      signoffs: [{ stage: "EXECUTIVE_REVIEW", approved: true, createdAt: "2026-10-09T18:00:00Z" }]
    });
    const seen = nextSeenSignatures({}, signatures("a-roll", stageThree), "a-roll").seen;
    const another = facts({
      ...stageThree,
      signoffs: [...stageThree.signoffs, { stage: "EXECUTIVE_REVIEW", approved: true, createdAt: "2026-10-10T18:00:00Z" }]
    });
    expect([...nextSeenSignatures(seen, signatures("a-roll", another), "a-roll").flagged]).toEqual(["initial"]);
  });

  it("records a change back to nothing without a dot, and never flags the open stage", () => {
    const seen = nextSeenSignatures({}, signatures("a-roll", facts({ pitching: true })), "a-roll").seen;
    const unmarked = nextSeenSignatures(seen, signatures("a-roll", facts()), "a-roll");
    expect(unmarked.flagged.size).toBe(0);
    expect(unmarked.seen.pitching).toBe("");

    const approvedHere = nextSeenSignatures(unmarked.seen, signatures("pitching", facts({ pitching: true })), "pitching");
    expect(approvedHere.flagged.size).toBe(0);
  });
});
