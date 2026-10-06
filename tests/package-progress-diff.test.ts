import { describe, expect, it } from "vitest";

import { jsonEqual } from "@/src/lib/json-equal";
import { memberSetChanged, progressRowChanged } from "@/src/lib/package-progress-diff";

const prior = {
  id: "row-1",
  cycleNumber: 2,
  rowOrder: 0,
  groupTopic: "Bike lanes",
  category: null,
  assignedProducerUserId: "ap-1",
  pitching: true,
  notes: "",
  stageNotes: { pitching: "ok", "a-roll": "reshoot" },
  members: [{ userId: "u-1" }]
};

describe("progressRowChanged", () => {
  it("is false when every written field matches the stored row", () => {
    expect(
      progressRowChanged(prior, {
        cycleNumber: 2,
        rowOrder: 0,
        groupTopic: "Bike lanes",
        category: null,
        assignedProducerUserId: "ap-1",
        pitching: true,
        notes: "",
        stageNotes: { "a-roll": "reshoot", pitching: "ok" }
      })
    ).toBe(false);
  });

  it("ignores undefined fields, which Prisma leaves untouched", () => {
    expect(progressRowChanged(prior, { groupTopic: "Bike lanes", stageNotes: undefined })).toBe(false);
  });

  it("detects a changed scalar, null vs value, and reordered rows", () => {
    expect(progressRowChanged(prior, { groupTopic: "Bike lanes 2" })).toBe(true);
    expect(progressRowChanged(prior, { assignedProducerUserId: null })).toBe(true);
    expect(progressRowChanged(prior, { category: "NEWS" })).toBe(true);
    expect(progressRowChanged(prior, { pitching: false })).toBe(true);
    expect(progressRowChanged(prior, { rowOrder: 1 })).toBe(true);
  });

  it("detects changed stage notes", () => {
    expect(progressRowChanged(prior, { stageNotes: { pitching: "ok" } })).toBe(true);
    expect(progressRowChanged(prior, { stageNotes: { pitching: "ok", "a-roll": "done" } })).toBe(true);
    expect(progressRowChanged({ ...prior, stageNotes: null }, { stageNotes: {} })).toBe(true);
  });

  it("treats a field missing from the stored row as changed", () => {
    expect(progressRowChanged(prior, { extension: false })).toBe(true);
  });
});

describe("memberSetChanged", () => {
  it("ignores order and duplicates", () => {
    expect(memberSetChanged(["a", "b"], ["b", "a"])).toBe(false);
    expect(memberSetChanged([], [])).toBe(false);
  });

  it("detects added, removed, and swapped members", () => {
    expect(memberSetChanged(["a"], ["a", "b"])).toBe(true);
    expect(memberSetChanged(["a", "b"], ["a"])).toBe(true);
    expect(memberSetChanged(["a", "b"], ["a", "c"])).toBe(true);
    expect(memberSetChanged(["a"], [])).toBe(true);
  });
});

describe("jsonEqual", () => {
  it("compares nested arrays and objects by value", () => {
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(jsonEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(jsonEqual([], {})).toBe(false);
    expect(jsonEqual("1", 1)).toBe(false);
  });
});
