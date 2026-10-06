import { describe, expect, it } from "vitest";
import { filterCutGroups } from "@/src/lib/meetings/client/cut-filter";
import type { MeetingCutGroup, MeetingCutVersion } from "@/src/lib/meetings/types";

const v: MeetingCutVersion = { versionId: "v", mediaId: "m", versionNumber: 1, durationSeconds: 60, approved: false, uploadedAt: "2026-10-01T00:00:00.000Z" };
const groups: MeetingCutGroup[] = [
  { rowId: "a", topic: "Homecoming Week", members: ["Abby", "Otto"], initial: [v], final: [v] },
  { rowId: "b", topic: "Robotics Regionals", members: ["Sage"], initial: [v], final: [] }
];
const ids = (list: MeetingCutGroup[]) => list.map((g) => g.rowId);

describe("filterCutGroups", () => {
  it("matches topic or member, every word, any case", () => {
    expect(ids(filterCutGroups(groups, "", "all"))).toEqual(["a", "b"]);
    expect(ids(filterCutGroups(groups, "SAGE", "all"))).toEqual(["b"]);
    expect(ids(filterCutGroups(groups, "week otto", "all"))).toEqual(["a"]);
    expect(ids(filterCutGroups(groups, "week sage", "all"))).toEqual([]);
  });

  it("keeps only groups with that kind of cut", () => {
    expect(ids(filterCutGroups(groups, "", "final"))).toEqual(["a"]);
    expect(ids(filterCutGroups(groups, "", "initial"))).toEqual(["a", "b"]);
  });
});
