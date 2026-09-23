import { describe, expect, it } from "vitest";
import {
  filterAssistantLookupGroups,
  formatAssistantReviewComment,
  formatAssistantStageComment,
  summarizeAssistantGroup
} from "@/src/server/assistant-lookups";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    cycleNumber: 1,
    groupTopic: "Solar buses",
    category: "NEWS",
    pitching: false,
    proofOfContact: false,
    aRollBRoll: false,
    initialCut: false,
    finalCut: false,
    awaitingRevisedInitialCut: false,
    queuedForAirAt: null,
    queuedForShowDate: null,
    brainstormDocUrl: "",
    assignedProducerUserId: "ap-1",
    assignedExecutiveProducerUserId: null,
    assignedProducer: { name: "Ada Lovelace", nickname: "Ada", email: "ada@pausd.us" },
    assignedExecutiveProducer: null,
    members: [{ userId: "lo-1", user: { name: "Lucas Hale", nickname: "Lo", email: "lo@pausd.us" } }],
    approval: null,
    _count: { proofOfContacts: 0, stageComments: 0 },
    initialCutMediaItem: null,
    finalCutMediaItemId: null,
    stageMedia: [],
    stageComments: [],
    ...overrides
  } as Parameters<typeof summarizeAssistantGroup>[0];
}

describe("summarizeAssistantGroup", () => {
  it("reports pitch pending as the current stage and status", () => {
    const summary = summarizeAssistantGroup(row());
    expect(summary.topic).toBe("Solar buses");
    expect(summary.members).toEqual(["Lo"]);
    expect(summary.producer).toBe("Ada");
    expect(summary.currentStage).toBe("Pitch");
    expect(summary.status).toBe("Pitch Pending");
    expect(summary.noteCount).toBe(0);
  });

  it("marks packages the signed-in producer is assigned to", () => {
    expect(summarizeAssistantGroup(row(), false, "ap-1")).toMatchObject({
      youProduce: true,
      youOnIt: false
    });
    expect(summarizeAssistantGroup(row(), false, "lo-1")).toMatchObject({
      youProduce: false,
      youOnIt: true
    });
    expect(
      summarizeAssistantGroup(
        row({ assignedProducerUserId: null, assignedExecutiveProducerUserId: "ep-1" }),
        false,
        "ep-1"
      )
    ).toMatchObject({ youProduce: true });
  });

  it("moves current stage to Final after approval", () => {
    const summary = summarizeAssistantGroup(
      row({
        pitching: true,
        proofOfContact: true,
        aRollBRoll: true,
        initialCut: true,
        approval: { stage: "APPROVED", controversial: false, signoffs: [] },
        initialCutMediaItem: { currentVersion: { versionNumber: 2, approvalStatus: "APPROVED" } },
        finalCutMediaItemId: "media-1"
      }),
      true
    );
    expect(summary.currentStage).toBe("Final");
    expect(summary.status).toBe("Final Cut Submitted");
    expect(summary).toMatchObject({
      stages: {
        pitching: "approved",
        contact: "approved",
        aRoll: "approved",
        initial: "approved",
        final: "submitted"
      }
    });
  });
});

describe("formatAssistantStageComment", () => {
  it("labels approval notes and clip notes and strips markers", () => {
    expect(
      formatAssistantStageComment({
        stage: "a-roll",
        body: "[[approved]]\nNice standup.",
        createdAt: new Date("2026-09-05T12:00:00.000Z"),
        author: { nickname: "Ada" }
      })
    ).toMatchObject({
      stage: "A/B-roll",
      from: "Ada",
      kind: "approval note",
      text: "Nice standup."
    });
    expect(
      formatAssistantStageComment({
        stage: "a-roll",
        body: "[[clip:media-1]]\nTighten the open.",
        createdAt: new Date("2026-09-05T12:00:00.000Z"),
        author: { nickname: "Ada" }
      })
    ).toMatchObject({ kind: "clip note", text: "Tighten the open." });
  });
});

describe("formatAssistantReviewComment", () => {
  it("includes timecode and resolved", () => {
    expect(
      formatAssistantReviewComment({
        body: "Hold on the wide.",
        timeSeconds: 75,
        resolvedAt: null,
        createdAt: new Date("2026-09-05T12:00:00.000Z"),
        author: { nickname: "Ada" },
        cut: "Initial Cut"
      })
    ).toMatchObject({
      cut: "Initial Cut",
      from: "Ada",
      text: "Hold on the wide.",
      at: "00:01:15",
      resolved: false
    });
  });
});

describe("filterAssistantLookupGroups", () => {
  const groups = [
    {
      id: "mine",
      assignedProducerUserId: "ap-1",
      members: [{ userId: "lo-1" }]
    },
    {
      id: "other",
      assignedProducerUserId: "ap-2",
      members: [{ userId: "ada-1" }]
    }
  ];

  it("limits reporters to packages they are on", () => {
    const visible = filterAssistantLookupGroups(groups, {
      platformRole: null,
      currentUserId: "lo-1",
      producerCategory: null
    });
    expect(visible.map((row) => row.id)).toEqual(["mine"]);
  });

  it("does not let a reporter see every package", () => {
    const visible = filterAssistantLookupGroups(groups, {
      platformRole: null,
      currentUserId: "stranger",
      producerCategory: null
    });
    expect(visible).toEqual([]);
  });
});
