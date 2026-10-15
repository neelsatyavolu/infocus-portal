import { describe, expect, it } from "vitest";
import { rowHasContent, viewerAttention, visibleGroupRows, type AttentionRow } from "@/components/groups/group-attention";

const AP = "ap-abby";
const DOC = "https://docs.google.com/document/d/example";

function row(overrides: Partial<AttentionRow> = {}): AttentionRow {
  return {
    groupTopic: "Bike lanes",
    pitching: true,
    proofOfContact: false,
    aRollBRoll: false,
    initialCut: false,
    finalCut: false,
    assignedProducerUserId: AP,
    members: [{ userId: "student-otto" }],
    ...overrides
  };
}

describe("viewerAttention", () => {
  it("never marks a group for an associate producer (the Groups page and sidebar agree)", () => {
    const brainstormReady = row({ proofs: [1, 2, 3], brainstormDocUrl: DOC });
    const stageOneCut = row({ proofOfContact: true, aRollBRoll: true, approvalStage: "ASSOCIATE_REVIEW" });
    expect(viewerAttention("ASSOCIATE_PRODUCER", AP, brainstormReady)).toBeNull();
    expect(viewerAttention("ASSOCIATE_PRODUCER", AP, stageOneCut)).toBeNull();
  });

  it("keeps the executive and adviser rules", () => {
    const stageThree = row({
      proofOfContact: true,
      aRollBRoll: true,
      approvalStage: "EXECUTIVE_REVIEW",
      assignedProducerUserId: null
    });
    expect(viewerAttention("EXECUTIVE_PRODUCER", "ep-sage", stageThree)).toBe("needed");
    expect(viewerAttention("ADVISER", "adviser", stageThree)).toBe("waiting");
    expect(viewerAttention("ADVISER", "adviser", { ...stageThree, approvalStage: "ADVISER_REVIEW" })).toBe("needed");
  });
});

describe("visibleGroupRows", () => {
  const empty: AttentionRow = {
    ...row(),
    groupTopic: "",
    members: [],
    assignedProducerUserId: null,
    pitching: false
  };

  it("hides rows with nothing filled in", () => {
    expect(rowHasContent(empty)).toBe(false);
    expect(rowHasContent(row())).toBe(true);
  });

  it("applies the associate's visibility rule after the content filter", () => {
    const rows = [row(), row({ assignedProducerUserId: "ap-sage" }), empty];
    const viewer = { platformRole: "ASSOCIATE_PRODUCER" as const, currentUserId: AP, producerCategory: null };
    expect(visibleGroupRows(rows, viewer)).toEqual([rows[0]]);
    expect(visibleGroupRows(rows, { ...viewer, platformRole: "EXECUTIVE_PRODUCER" })).toEqual([rows[0], rows[1]]);
  });
});
