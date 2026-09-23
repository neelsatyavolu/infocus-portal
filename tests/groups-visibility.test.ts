import { describe, expect, it } from "vitest";

import {
  filterGroupsForViewer,
  isGroupAssignedToViewer,
  isPrimaryGroupForViewer
} from "@/src/lib/groups-visibility";

const rows = [
  { id: "mine", assignedProducerUserId: "ap-1", category: "NEWS" as const },
  { id: "other-ap", assignedProducerUserId: "ap-2", category: "FEATURE" as const },
  { id: "unassigned-news", assignedProducerUserId: null, category: "NEWS" as const },
  { id: "unassigned-feature", assignedProducerUserId: null, category: "FEATURE" as const }
];

describe("filterGroupsForViewer", () => {
  it("lets executive producers see every package", () => {
    const visible = filterGroupsForViewer(rows, {
      platformRole: "EXECUTIVE_PRODUCER",
      currentUserId: "ep-1",
      producerCategory: null
    });
    expect(visible.map((row) => row.id)).toEqual(rows.map((row) => row.id));
  });

  it("lets super-admin and the adviser see every package", () => {
    for (const platformRole of ["SUPER_ADMIN", "ADVISER"] as const) {
      const visible = filterGroupsForViewer(rows, {
        platformRole,
        currentUserId: "viewer",
        producerCategory: null
      });
      expect(visible.map((row) => row.id)).toEqual(rows.map((row) => row.id));
    }
  });

  it("limits associates to assigned groups, then their category", () => {
    const visible = filterGroupsForViewer(rows, {
      platformRole: "ASSOCIATE_PRODUCER",
      currentUserId: "ap-1",
      producerCategory: "NEWS"
    });
    expect(visible.map((row) => row.id)).toEqual(["mine", "unassigned-news"]);
  });
});

describe("isGroupAssignedToViewer", () => {
  it("matches the assigned associate or executive producer", () => {
    expect(
      isGroupAssignedToViewer(
        { assignedProducerUserId: "ap-1", assignedExecutiveProducerUserId: "ep-1" },
        "ap-1"
      )
    ).toBe(true);
    expect(
      isGroupAssignedToViewer(
        { assignedProducerUserId: "ap-1", assignedExecutiveProducerUserId: "ep-1" },
        "ep-1"
      )
    ).toBe(true);
    expect(
      isGroupAssignedToViewer(
        { assignedProducerUserId: "ap-1", assignedExecutiveProducerUserId: "ep-1" },
        "other"
      )
    ).toBe(false);
  });
});

describe("isPrimaryGroupForViewer", () => {
  const unassigned = {
    assignedProducerUserId: "ap-2",
    assignedExecutiveProducerUserId: "ep-other",
    approvalStage: "DRAFT" as const
  };
  const exec = { currentUserId: "ep-1", platformRole: "EXECUTIVE_PRODUCER" as const };
  const adviser = { currentUserId: "adviser-1", platformRole: "ADVISER" as const };

  it("keeps packages assigned to the viewer in the main list at any stage", () => {
    expect(
      isPrimaryGroupForViewer(
        { assignedProducerUserId: null, assignedExecutiveProducerUserId: "ep-1", approvalStage: "DRAFT" },
        exec
      )
    ).toBe(true);
  });

  it("pins unassigned initial-cut stage 3 and final cut for execs and the adviser", () => {
    for (const viewer of [exec, adviser, { currentUserId: "admin", platformRole: "SUPER_ADMIN" as const }]) {
      expect(isPrimaryGroupForViewer({ ...unassigned, approvalStage: "EXECUTIVE_REVIEW" }, viewer)).toBe(true);
      expect(isPrimaryGroupForViewer({ ...unassigned, approvalStage: "APPROVED" }, viewer)).toBe(true);
    }
  });

  it("leaves earlier unassigned stages in Other groups for execs", () => {
    expect(isPrimaryGroupForViewer({ ...unassigned, approvalStage: "ASSOCIATE_REVIEW" }, exec)).toBe(false);
    expect(isPrimaryGroupForViewer({ ...unassigned, approvalStage: "ADVISER_REVIEW" }, exec)).toBe(false);
  });

  it("pins adviser-review (stage 2) for the adviser only", () => {
    expect(isPrimaryGroupForViewer({ ...unassigned, approvalStage: "ADVISER_REVIEW" }, adviser)).toBe(true);
    expect(isPrimaryGroupForViewer({ ...unassigned, approvalStage: "ASSOCIATE_REVIEW" }, adviser)).toBe(false);
  });

  it("does not pin stage 3 for associates who are not assigned", () => {
    expect(
      isPrimaryGroupForViewer(
        { ...unassigned, approvalStage: "EXECUTIVE_REVIEW" },
        { currentUserId: "ap-1", platformRole: "ASSOCIATE_PRODUCER" }
      )
    ).toBe(false);
  });
});
