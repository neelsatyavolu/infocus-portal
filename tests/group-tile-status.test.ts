import { describe, expect, it } from "vitest";
import {
  cutTileReviewStatus,
  groupTileStatus,
  groupViewerAttention,
  type GroupTileStatusInput
} from "@/src/lib/group-tile-status";

function base(overrides: Partial<GroupTileStatusInput> = {}): GroupTileStatusInput {
  return {
    pitching: true,
    proofOfContact: true,
    proofCount: 3,
    brainstormDocUrl: "https://docs.google.com/document/d/abc",
    aRollBRoll: true,
    aRollHasMedia: true,
    initialCutHasMedia: false,
    initialCutVersionNumber: null,
    initialCutNeedsRevisions: false,
    awaitingRevisedInitialCut: false,
    approvalStage: "DRAFT",
    finalCutHasMedia: false,
    queuedForAir: false,
    ...overrides
  };
}

describe("groupTileStatus", () => {
  it("shows whole elapsed review hours for the pending stage", () => {
    const now = Date.parse("2026-09-18T12:45:00Z");
    const reviewReadyAt = {
      brainstorming: "2026-09-17T00:00:00Z",
      "a-roll": "2026-09-17T12:00:00Z",
      "initial-cut": "2026-09-18T12:00:00Z"
    };
    expect(groupTileStatus(base({ proofOfContact: false, reviewReadyAt }), now).label)
      .toBe("Brainstorm Pending Review for 36h");
    expect(groupTileStatus(base({ aRollBRoll: false, reviewReadyAt }), now).label)
      .toBe("A-roll/B-roll Pending Review for 24h");
    expect(groupTileStatus(base({
      initialCutHasMedia: true, initialCutVersionNumber: 2,
      approvalStage: "ASSOCIATE_REVIEW", reviewReadyAt
    }), now).label).toBe("Initial Cut V2 Pending Review for 0h");
    expect(groupTileStatus(base({
      aRollBRoll: false, aRollNeedsChanges: true, reviewReadyAt
    }), now).label).toBe("A-roll/B-roll Needs Revisions");
  });

  it("omits unknown review times and never shows negative hours", () => {
    const now = Date.parse("2026-09-18T12:00:00Z");
    for (const timestamp of [null, "invalid"]) {
      expect(groupTileStatus(base({
        aRollBRoll: false, reviewReadyAt: { "a-roll": timestamp }
      }), now).label).toBe("A-roll/B-roll Pending Review");
    }
    expect(groupTileStatus(base({
      aRollBRoll: false, reviewReadyAt: { "a-roll": "2026-09-18T13:00:00Z" }
    }), now).label).toBe("A-roll/B-roll Pending Review for 0h");
  });

  it("distinguishes Stage 1 approval awaiting upload from a revision request", () => {
    expect(groupTileStatus(base({
      initialCutHasMedia: true, approvalStage: "ASSOCIATE_REVIEW",
      awaitingRevisedInitialCut: true
    }))).toEqual({ label: "Approved in Stage 1 · Awaiting revised upload", tone: "approved" });
  });

  it("describes each pending stage for producers", () => {
    expect(groupTileStatus(base({ pitching: false })).label).toBe("Pitch Pending");
    expect(
      groupTileStatus(
        base({
          pitching: true,
          proofOfContact: false,
          proofCount: 3,
          brainstormDocUrl: "https://docs.google.com/document/d/abc"
        })
      )
    ).toEqual({ label: "Brainstorm Pending Review", tone: "warn" });
    expect(groupTileStatus(base({ aRollBRoll: false, aRollHasMedia: true }))).toEqual({
      label: "A-roll/B-roll Pending Review",
      tone: "warn"
    });
    expect(
      groupTileStatus(base({ aRollBRoll: false, aRollHasMedia: true, aRollNeedsChanges: true }))
    ).toEqual({
      label: "A-roll/B-roll Needs Revisions",
      tone: "danger"
    });
    expect(
      groupTileStatus(
        base({
          initialCutHasMedia: true,
          initialCutVersionNumber: 2,
          approvalStage: "ASSOCIATE_REVIEW"
        })
      )
    ).toEqual({ label: "Initial Cut V2 Pending Review", tone: "warn" });
    expect(
      groupTileStatus(base({ initialCutHasMedia: true, approvalStage: "ADVISER_REVIEW" }))
    ).toEqual({ label: "Waiting for the adviser (Stage 2)", tone: "review" });
    expect(
      groupTileStatus(
        base({
          initialCutHasMedia: true,
          approvalStage: "EXECUTIVE_REVIEW",
          remainingExecutiveSignoffs: 1
        })
      )
    ).toEqual({ label: "1 exec left", tone: "review" });
    expect(
      groupTileStatus(base({ approvalStage: "APPROVED", finalCutHasMedia: true }))
    ).toEqual({ label: "Final Cut Submitted", tone: "warn" });
  });

  it("flags Stage 2 for the adviser and Stage 3 for executives", () => {
    expect(groupViewerAttention("ADVISER", "ADVISER_REVIEW")).toBe("needed");
    expect(groupViewerAttention("ADVISER", "EXECUTIVE_REVIEW")).toBe("waiting");
    expect(groupViewerAttention("EXECUTIVE_PRODUCER", "EXECUTIVE_REVIEW")).toBe("needed");
    expect(groupViewerAttention("EXECUTIVE_PRODUCER", "ADVISER_REVIEW")).toBe("waiting");
    expect(groupViewerAttention("SUPER_ADMIN", "EXECUTIVE_REVIEW")).toBe("needed");
    expect(groupViewerAttention("ASSOCIATE_PRODUCER", "ASSOCIATE_REVIEW")).toBeNull();
    expect(
      groupViewerAttention("EXECUTIVE_PRODUCER", "ASSOCIATE_REVIEW", {
        currentUserId: "ep1",
        assignedExecutiveProducerUserId: "ep1"
      })
    ).toBe("needed");
    expect(
      groupViewerAttention("EXECUTIVE_PRODUCER", "ASSOCIATE_REVIEW", {
        currentUserId: "ep1",
        assignedExecutiveProducerUserId: "ep2"
      })
    ).toBe("waiting");
    expect(
      groupViewerAttention("EXECUTIVE_PRODUCER", "APPROVED", {
        finalCutHasMedia: true,
        queuedForAir: false
      })
    ).toBe("needed");
    expect(
      groupViewerAttention("SUPER_ADMIN", "APPROVED", {
        finalCutHasMedia: true,
        queuedForAir: false,
        currentUserId: "neel",
        scoredByUserIds: []
      })
    ).toBe("needed");
    expect(
      groupViewerAttention("EXECUTIVE_PRODUCER", "APPROVED", {
        finalCutHasMedia: true,
        queuedForAir: false,
        currentUserId: "ep1",
        scoredByUserIds: ["ep1"]
      })
    ).toBe("waiting");
    expect(
      groupViewerAttention("EXECUTIVE_PRODUCER", "APPROVED", {
        finalCutHasMedia: true,
        queuedForAir: true
      })
    ).toBe("waiting");
  });

  it("waits on the group after a reviewer asks for Initial Cut revisions", () => {
    const sentBack = { initialCutNeedsRevisions: true };
    expect(groupViewerAttention("ADVISER", "ADVISER_REVIEW", sentBack)).toBe("waiting");
    expect(groupViewerAttention("EXECUTIVE_PRODUCER", "EXECUTIVE_REVIEW", sentBack)).toBe("waiting");
    expect(
      groupViewerAttention("EXECUTIVE_PRODUCER", "ASSOCIATE_REVIEW", {
        ...sentBack,
        currentUserId: "ep1",
        assignedExecutiveProducerUserId: "ep1"
      })
    ).toBe("waiting");
  });

  it("treats brainstorming and a-roll as the assigned EP's stage", () => {
    const assigned = {
      currentUserId: "ep1",
      assignedExecutiveProducerUserId: "ep1"
    };
    expect(
      groupViewerAttention("EXECUTIVE_PRODUCER", "DRAFT", {
        ...assigned,
        proofOfContact: false,
        proofCount: 1,
        brainstormDocUrl: ""
      })
    ).toBeNull();
    expect(
      groupViewerAttention("SUPER_ADMIN", "DRAFT", {
        currentUserId: "admin",
        assignedExecutiveProducerUserId: "admin",
        proofOfContact: false,
        proofCount: 3,
        brainstormDocUrl: "https://docs.google.com/document/d/abc"
      })
    ).toBe("needed");
    expect(
      groupViewerAttention("EXECUTIVE_PRODUCER", "DRAFT", {
        currentUserId: "ep1",
        assignedExecutiveProducerUserId: "ep2",
        proofOfContact: false,
        proofCount: 3,
        brainstormDocUrl: "https://docs.google.com/document/d/abc"
      })
    ).toBe("waiting");
    expect(
      groupViewerAttention("EXECUTIVE_PRODUCER", "DRAFT", {
        ...assigned,
        proofOfContact: true,
        aRollBRoll: false,
        aRollHasMedia: true
      })
    ).toBe("needed");
    expect(
      groupViewerAttention("EXECUTIVE_PRODUCER", "DRAFT", {
        ...assigned,
        proofOfContact: true,
        aRollBRoll: false,
        aRollHasMedia: false
      })
    ).toBeNull();
    expect(
      groupViewerAttention("EXECUTIVE_PRODUCER", "ADVISER_REVIEW", {
        ...assigned,
        proofOfContact: true,
        aRollBRoll: true
      })
    ).toBe("waiting");
  });

  it("labels a single cut as pending, review submitted, or approved", () => {
    expect(cutTileReviewStatus({ approvalStatus: "IN_REVIEW" })).toEqual({
      label: "Pending review",
      tone: "review"
    });
    expect(cutTileReviewStatus({ approvalStatus: "NEEDS_CHANGES" })).toEqual({
      label: "Needs revisions",
      tone: "danger"
    });
    expect(cutTileReviewStatus({ approvalStatus: "APPROVED", approvedInStage: 2, reviewStage: 2 })).toEqual({
      label: "Approved in Stage 2",
      tone: "approved"
    });
    expect(cutTileReviewStatus({ approvalStatus: "APPROVED", approvedInStage: 2, reviewStage: 3 })).toEqual({
      label: "Pending review · Approved in Stage 2",
      tone: "review"
    });
    expect(cutTileReviewStatus({ approvalStatus: "APPROVED", approvedInStage: 1, reviewStage: 2 })).toEqual({
      label: "Pending review · Approved in Stage 1",
      tone: "review"
    });
    expect(
      cutTileReviewStatus({
        approvalStatus: "APPROVED",
        approvedInStage: 3,
        reviewStage: 3,
        remainingExecutiveSignoffs: 1
      })
    ).toEqual({ label: "1 exec left", tone: "review" });
    expect(
      cutTileReviewStatus({
        approvalStatus: "APPROVED",
        approvedInStage: 3,
        reviewStage: 3,
        remainingExecutiveSignoffs: 2
      })
    ).toEqual({ label: "2 execs left", tone: "review" });
  });
});
