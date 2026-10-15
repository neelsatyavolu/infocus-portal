import { describe, expect, it } from "vitest";
import {
  buildGroupRowView,
  cycleHasDeadlines,
  groupViewsByExecutive,
  hasQueuedSave,
  toggleRowStage,
  toSavePayload,
  withQueuedSave,
  type GroupRow
} from "@/app/(app)/groups/group-row-model";

const AP = "ap-abby";
const EP_SAGE = { userId: "ep-sage", name: "Sage Example", email: "sage@example.edu" };
const EP_OTTO = { userId: "ep-otto", name: "Otto Example", email: "otto@example.edu" };
const NOW = new Date("2026-10-01T12:00:00Z");

function row(overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    id: "row-1",
    groupMembers: "Abby, Otto",
    groupTopic: "Bike lanes",
    groupType: "PAIR",
    pitching: false,
    proofOfContact: false,
    aRollBRoll: false,
    initialCut: false,
    finalCut: false,
    extension: false,
    assignedProducerUserId: AP,
    assignedProducer: { userId: AP, name: "Abby Producer", email: "abby@example.edu" },
    members: [
      { userId: "student-otto", name: "Otto Student", email: "otto.student@example.edu" },
      { userId: "student-sage", name: "Sage Student", email: "sage.student@example.edu" }
    ],
    memberUserIds: ["student-otto", "student-sage"],
    ...overrides
  };
}

function view(input: GroupRow, role: "ASSOCIATE_PRODUCER" | "EXECUTIVE_PRODUCER" = "EXECUTIVE_PRODUCER", userId = "ep-sage") {
  return buildGroupRowView(input, 0, { platformRole: role, currentUserId: userId, cycleDates: null, now: NOW });
}

describe("toSavePayload", () => {
  it("sends every roster field the POST expects, and nothing view-only", () => {
    const full = row({
      category: "NEWS",
      assignedExecutiveProducerUserId: EP_SAGE.userId,
      assignedExecutiveProducer: EP_SAGE,
      projectId: "project-1",
      initialCutMediaItemId: "media-initial",
      finalCutMediaItemId: "media-final",
      pitching: true,
      initialCut: true,
      initialCutManual: true,
      revisedInitialCut: true,
      finalCutManual: false,
      extension: true,
      extensionDays: 2,
      possibleInterviews: "Coach",
      possibleIdeas: "Open on the bike rack",
      notes: "Call back Friday",
      stageNotes: { pitching: "Tighten the angle" },
      proofs: [],
      approvalStage: "ADVISER_REVIEW"
    });

    expect(toSavePayload(full)).toEqual({
      id: "row-1",
      groupMembers: "Abby, Otto",
      groupTopic: "Bike lanes",
      groupType: "PAIR",
      category: "NEWS",
      assignedProducerUserId: AP,
      assignedExecutiveProducerUserId: "ep-sage",
      memberUserIds: ["student-otto", "student-sage"],
      projectId: "project-1",
      initialCutMediaItemId: "media-initial",
      finalCutMediaItemId: "media-final",
      pitching: true,
      proofOfContact: false,
      aRollBRoll: false,
      initialCut: true,
      initialCutManual: true,
      revisedInitialCut: true,
      finalCut: false,
      finalCutManual: false,
      extension: true,
      possibleInterviews: "Coach",
      possibleIdeas: "Open on the bike rack",
      notes: "Call back Friday",
      stageNotes: { pitching: "Tighten the angle" }
    });
  });

  it("fills missing optional fields with empty values instead of dropping them", () => {
    const sparse: GroupRow = {
      groupMembers: "",
      groupTopic: "",
      groupType: "",
      pitching: false,
      proofOfContact: false,
      aRollBRoll: false,
      initialCut: false,
      finalCut: false,
      extension: false
    };
    expect(toSavePayload(sparse)).toEqual({
      id: undefined,
      groupMembers: "",
      groupTopic: "",
      groupType: "",
      category: null,
      assignedProducerUserId: null,
      assignedExecutiveProducerUserId: null,
      memberUserIds: [],
      projectId: null,
      initialCutMediaItemId: null,
      finalCutMediaItemId: null,
      pitching: false,
      proofOfContact: false,
      aRollBRoll: false,
      initialCut: false,
      initialCutManual: false,
      revisedInitialCut: false,
      finalCut: false,
      finalCutManual: false,
      extension: false,
      possibleInterviews: "",
      possibleIdeas: "",
      notes: "",
      stageNotes: null
    });
  });
});

describe("toggleRowStage", () => {
  it("flips the stage without touching the original row", () => {
    const original = row();
    const next = toggleRowStage(original, "pitching");
    expect(next.pitching).toBe(true);
    expect(original.pitching).toBe(false);
    expect(next.initialCutManual).toBeUndefined();
    expect(next.finalCutManual).toBeUndefined();
    expect(toggleRowStage(next, "pitching").pitching).toBe(false);
  });

  it("marks Initial and Final as set by hand, both ways", () => {
    const initialOn = toggleRowStage(row(), "initialCut");
    expect(initialOn).toMatchObject({ initialCut: true, initialCutManual: true });
    expect(initialOn.finalCutManual).toBeUndefined();
    expect(toggleRowStage(initialOn, "initialCut")).toMatchObject({ initialCut: false, initialCutManual: true });

    const finalOn = toggleRowStage(row({ finalCut: true }), "finalCut");
    expect(finalOn).toMatchObject({ finalCut: false, finalCutManual: true });
    expect(finalOn.initialCutManual).toBeUndefined();
  });
});

describe("buildGroupRowView", () => {
  it("opens the pending stage of the approval chain", () => {
    const result = view(row({ pitching: true, proofOfContact: true, aRollBRoll: true, approvalStage: "ADVISER_REVIEW" }));
    expect(result.pendingSlug).toBe("initial-stage-2");
    expect(result.pendingLabel).toBe("Initial 2");
    expect(result.href).toBe("/groups/row-1/initial-stage-2");
    expect(result.segments.map((segment) => segment.state)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "current",
      "todo",
      "todo"
    ]);
  });

  it("follows the review stage a cut was sent back from", () => {
    const sentBack = row({
      pitching: true,
      proofOfContact: true,
      aRollBRoll: true,
      approvalStage: "DRAFT",
      initialCutNeedsRevisions: true,
      initialCutReviewStage: "EXECUTIVE_REVIEW"
    });
    expect(view(sentBack).pendingSlug).toBe("initial-stage-3");
    expect(view({ ...sentBack, initialCutNeedsRevisions: false }).pendingSlug).toBe("initial-stage-1");
  });

  it("counts check-in points and completion", () => {
    expect(view(row({ pitching: true, proofOfContact: true })).checkIns).toBe(10);
    const done = view(row({ pitching: true, proofOfContact: true, aRollBRoll: true, initialCut: true, finalCut: true }));
    expect(done.checkIns).toBe(20);
    expect(done.complete).toBe(true);
    expect(view(row()).complete).toBe(false);
  });

  it("labels people and falls back when names or the topic are missing", () => {
    const result = view(row({ assignedExecutiveProducer: EP_SAGE }));
    expect(result.memberNames).toBe("Otto, Sage");
    expect(result.apName).toBe("Abby Producer");
    expect(result.epName).toBe("Sage Example");
    expect(result.contactLine).toBe("Contact 0/3 · no doc");

    const bare = view(row({ groupTopic: "  ", members: [], memberUserIds: [], assignedProducer: null }));
    expect(bare.topic).toBe("Untitled package");
    expect(bare.memberNames).toBe("No members");
    expect(bare.apName).toBe("—");
    expect(bare.epName).toBe("—");
  });

  it("has no link and an index key for a row that hasn't been saved", () => {
    const unsaved = buildGroupRowView(row({ id: undefined }), 4, {
      platformRole: "EXECUTIVE_PRODUCER",
      currentUserId: "ep-sage",
      cycleDates: null,
      now: NOW
    });
    expect(unsaved.key).toBe("row-4");
    expect(unsaved.href).toBeNull();
    expect(unsaved.canNotes).toBe(false);
    expect(unsaved.canApprovePitch).toBe(false);
  });

  it("gives Notes to the assigned associate only when they aren't a member", () => {
    expect(view(row(), "ASSOCIATE_PRODUCER", AP).canNotes).toBe(true);
    expect(view(row(), "ASSOCIATE_PRODUCER", "ap-other").canNotes).toBe(false);
    const memberAp = row({ members: [{ userId: AP, name: "Abby Producer", email: null }] });
    expect(view(memberAp, "ASSOCIATE_PRODUCER", AP).canNotes).toBe(false);
    expect(view(row(), "EXECUTIVE_PRODUCER", "ep-sage").canNotes).toBe(true);
  });

  it("offers Approve pitch to executive roles until the pitch is approved", () => {
    expect(view(row(), "EXECUTIVE_PRODUCER").canApprovePitch).toBe(true);
    expect(view(row({ pitching: true }), "EXECUTIVE_PRODUCER").canApprovePitch).toBe(false);
    expect(view(row(), "ASSOCIATE_PRODUCER", AP).canApprovePitch).toBe(false);
  });

  it("has no schedule or extension tag without cycle dates or an extension", () => {
    const result = view(row());
    expect(result.schedule).toBeNull();
    expect(result.extensionLabel).toBeNull();
  });
});

describe("groupViewsByExecutive", () => {
  it("buckets by executive producer, sorted by name, Unassigned last, keeping row order", () => {
    const views = [
      row({ id: "a", assignedExecutiveProducerUserId: null }),
      row({ id: "b", assignedExecutiveProducerUserId: EP_SAGE.userId, assignedExecutiveProducer: EP_SAGE }),
      row({
        id: "c",
        assignedExecutiveProducerUserId: EP_OTTO.userId,
        assignedExecutiveProducer: EP_OTTO,
        pitching: true,
        proofOfContact: true,
        aRollBRoll: true,
        initialCut: true,
        finalCut: true
      }),
      row({ id: "d", assignedExecutiveProducerUserId: EP_SAGE.userId, assignedExecutiveProducer: EP_SAGE })
    ].map((item, index) =>
      buildGroupRowView(item, index, { platformRole: "EXECUTIVE_PRODUCER", currentUserId: "ep-sage", cycleDates: null, now: NOW })
    );

    const buckets = groupViewsByExecutive(views);
    expect(buckets.map((bucket) => bucket.key)).toEqual(["ep-otto", "ep-sage", "unassigned"]);
    expect(buckets.map((bucket) => bucket.executiveName)).toEqual(["Otto Example", "Sage Example", null]);
    expect(buckets.map((bucket) => bucket.views.map((item) => item.key))).toEqual([["c"], ["b", "d"], ["a"]]);
    expect(buckets.map((bucket) => bucket.completeCount)).toEqual([1, 0, 0]);
  });

  it("returns no buckets for no groups", () => {
    expect(groupViewsByExecutive([])).toEqual([]);
  });
});

describe("cycleHasDeadlines", () => {
  it("is true only when at least one stage has a date", () => {
    const none = { pitching: null, proofOfContact: null, aRollBRoll: null, initialCut: null, finalCut: null };
    expect(cycleHasDeadlines(null)).toBe(false);
    expect(cycleHasDeadlines(undefined)).toBe(false);
    expect(cycleHasDeadlines(none)).toBe(false);
    expect(cycleHasDeadlines({ ...none, finalCut: "2026-10-20" })).toBe(true);
  });
});

describe("withQueuedSave", () => {
  const cycleA = [row({ id: "row-a" })];
  const cycleAWithY = [row({ id: "row-a", proofOfContact: true })];
  const cycleB = [row({ id: "row-b", pitching: true })];

  it("keeps a waiting save for one cycle when another cycle queues a change", () => {
    const queue = withQueuedSave(withQueuedSave([], { cycleNumber: 1, rows: cycleAWithY }), { cycleNumber: 2, rows: cycleB });
    expect(queue).toEqual([
      { cycleNumber: 1, rows: cycleAWithY },
      { cycleNumber: 2, rows: cycleB }
    ]);
    expect(hasQueuedSave(queue, 1)).toBe(true);
    expect(hasQueuedSave(queue, 2)).toBe(true);
    expect(hasQueuedSave(queue, 3)).toBe(false);
  });

  it("replaces only that cycle's roster, in place, with its latest change", () => {
    const first = withQueuedSave(withQueuedSave([], { cycleNumber: 1, rows: cycleA }), { cycleNumber: 2, rows: cycleB });
    const next = withQueuedSave(first, { cycleNumber: 1, rows: cycleAWithY });
    expect(next).toEqual([
      { cycleNumber: 1, rows: cycleAWithY },
      { cycleNumber: 2, rows: cycleB }
    ]);
    expect(first[0]?.rows).toBe(cycleA);
  });
});
