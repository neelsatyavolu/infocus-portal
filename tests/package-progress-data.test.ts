import { describe, expect, it } from "vitest";

import { buildMissingProgressRows, mergeAssignableUsers } from "@/src/server/package-progress-data";

describe("buildMissingProgressRows", () => {
  it("creates one batched seed payload for every cycle missing rows", () => {
    const rows = buildMissingProgressRows([2, 4]);

    expect(rows).toHaveLength(20);
    expect(rows[0]).toMatchObject({
      cycleNumber: 2,
      rowOrder: 0,
      groupMembers: "",
      groupTopic: "",
      groupType: "",
      proofOfContact: false,
      aRollBRoll: false,
      initialCut: false,
      finalCut: false,
      extension: false,
      assignedProducerUserId: null,
      assignedExecutiveProducerUserId: null,
      possibleInterviews: "",
      possibleIdeas: "",
      notes: ""
    });
    expect(rows[9]).toMatchObject({
      cycleNumber: 2,
      rowOrder: 9
    });
    expect(rows[10]).toMatchObject({
      cycleNumber: 4,
      rowOrder: 0
    });
    expect(rows[19]).toMatchObject({
      cycleNumber: 4,
      rowOrder: 9
    });
  });

  it("returns no seed rows when every cycle is already initialized", () => {
    expect(buildMissingProgressRows([])).toEqual([]);
  });
});

describe("mergeAssignableUsers", () => {
  it("adds super-admin to the executive picker and dedupes by user id", () => {
    const executives = [
      { userId: "ep-2", name: "Olga Reyes", email: "olga@pausd.org", category: null },
      { userId: "ep-1", name: "Mia Young", email: "mia@pausd.org", category: null }
    ];
    const superAdmin = [
      { userId: "sa-1", name: "Neel Satyavolu", email: "superadmin@example.edu", category: null },
      { userId: "ep-1", name: "Mia Young", email: "mia@pausd.org", category: null }
    ];

    expect(mergeAssignableUsers(executives, superAdmin).map((user) => user.userId)).toEqual([
      "ep-1",
      "sa-1",
      "ep-2"
    ]);
  });
});
