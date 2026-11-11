import { describe, expect, it } from "vitest";
import type { GroupRow, GroupRowView } from "@/app/(app)/groups/group-row-model";
import { isOutstandingPackage, outstandingByCycle } from "@/app/(app)/groups/outstanding-packages";

function item(cycleNumber: number, topic: string, row: Partial<GroupRow> = {}) {
  const view = { topic, row: { groupTopic: topic, ...row } } as unknown as GroupRowView;
  return { cycleNumber, view };
}

describe("isOutstandingPackage", () => {
  it("is done only when graded, grades published and queued", () => {
    expect(isOutstandingPackage({ finalCutGraded: true, finalCutGradesPublished: true, queuedForAir: true })).toBe(false);
    expect(isOutstandingPackage({ finalCutGraded: true, queuedForAir: true })).toBe(true);
    expect(isOutstandingPackage({ finalCutGraded: true, finalCutGradesPublished: true, queuedForAir: false })).toBe(true);
    expect(isOutstandingPackage({ finalCutGraded: false, queuedForAir: true })).toBe(true);
    expect(isOutstandingPackage({})).toBe(true);
  });
});

describe("outstandingByCycle", () => {
  it("drops finished packages and orders oldest first, grouped by cycle", () => {
    const result = outstandingByCycle([
      item(3, "Zoo", {}),
      item(2, "Late cut", { finalCutSubmittedAt: "2026-10-05T00:00:00Z" }),
      item(2, "Done", { finalCutGraded: true, finalCutGradesPublished: true, queuedForAir: true }),
      item(2, "No cut yet", {}),
      item(2, "Early cut", { finalCutSubmittedAt: "2026-10-01T00:00:00Z" }),
      item(1, "Old", { queuedForAir: true })
    ]);
    expect(result.map((cycle) => cycle.cycleNumber)).toEqual([1, 2, 3]);
    expect(result[1]?.packages.map((p) => p.view.topic)).toEqual(["Early cut", "Late cut", "No cut yet"]);
  });

  it("returns nothing when every package is finished", () => {
    expect(
      outstandingByCycle([item(1, "Done", { finalCutGraded: true, finalCutGradesPublished: true, queuedForAir: true })])
    ).toEqual([]);
  });
});
