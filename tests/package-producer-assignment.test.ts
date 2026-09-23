import { describe, expect, it } from "vitest";

import {
  associateMayProducePackage,
  exclusiveProducerAssignment,
  isAssignedPackageProducer,
  mergeAssignableProducerOptions,
  producerMayActOnPackage,
  selectedAssignedProducerId
} from "@/src/lib/package-producer-assignment";

const ap = { userId: "ap-1", name: "Ada Associate", email: "ada@pausd.us" };
const ep = { userId: "ep-1", name: "Eli Executive", email: "eli@pausd.us" };

describe("exclusiveProducerAssignment", () => {
  it("stores an associate on the AP field and clears the EP", () => {
    expect(exclusiveProducerAssignment(ap.userId, ap, [ep.userId])).toEqual({
      assignedProducerUserId: "ap-1",
      assignedProducer: ap,
      assignedExecutiveProducerUserId: null,
      assignedExecutiveProducer: null
    });
  });

  it("stores an executive on the EP field and clears the AP", () => {
    expect(exclusiveProducerAssignment(ep.userId, ep, [ep.userId])).toEqual({
      assignedProducerUserId: null,
      assignedProducer: null,
      assignedExecutiveProducerUserId: "ep-1",
      assignedExecutiveProducer: ep
    });
  });

  it("clears both fields when unassigned", () => {
    expect(exclusiveProducerAssignment(null, null, [ep.userId])).toEqual({
      assignedProducerUserId: null,
      assignedProducer: null,
      assignedExecutiveProducerUserId: null,
      assignedExecutiveProducer: null
    });
  });
});

describe("isAssignedPackageProducer", () => {
  it("matches the assigned AP or the assigned EP, not the other role", () => {
    expect(
      isAssignedPackageProducer({ assignedProducerUserId: "ap-1", assignedExecutiveProducerUserId: null }, "ap-1")
    ).toBe(true);
    expect(
      isAssignedPackageProducer({ assignedProducerUserId: null, assignedExecutiveProducerUserId: "ep-1" }, "ep-1")
    ).toBe(true);
    expect(
      isAssignedPackageProducer({ assignedProducerUserId: null, assignedExecutiveProducerUserId: "ep-1" }, "ap-1")
    ).toBe(false);
    expect(
      isAssignedPackageProducer({ assignedProducerUserId: "ap-1", assignedExecutiveProducerUserId: null }, "ep-1")
    ).toBe(false);
    expect(
      isAssignedPackageProducer({ assignedProducerUserId: null, assignedExecutiveProducerUserId: null }, "ep-1")
    ).toBe(false);
  });
});

describe("selectedAssignedProducerId", () => {
  it("prefers the executive when both fields are set", () => {
    expect(
      selectedAssignedProducerId({
        assignedProducerUserId: "ap-1",
        assignedExecutiveProducerUserId: "ep-1"
      })
    ).toBe("ep-1");
  });

  it("returns the associate when no executive is set", () => {
    expect(
      selectedAssignedProducerId({
        assignedProducerUserId: "ap-1",
        assignedExecutiveProducerUserId: null
      })
    ).toBe("ap-1");
  });
});

describe("mergeAssignableProducerOptions", () => {
  it("merges APs and EPs with a kind tag and sorts by name", () => {
    expect(mergeAssignableProducerOptions([ap], [ep]).map((user) => [user.userId, user.kind])).toEqual([
      ["ap-1", "ap"],
      ["ep-1", "ep"]
    ]);
  });
});

describe("associateMayProducePackage", () => {
  const assigned = {
    assignedProducerUserId: "ap-1",
    members: [{ userId: "student-1" }, { userId: "student-2" }]
  };

  it("lets an AP act only on a package they are assigned to", () => {
    expect(associateMayProducePackage(assigned, "ap-1")).toBe(true);
    expect(associateMayProducePackage(assigned, "ap-2")).toBe(false);
    expect(
      associateMayProducePackage({ assignedProducerUserId: null, members: [{ userId: "student-1" }] }, "ap-1")
    ).toBe(false);
  });

  it("does not let an AP act on a package they are a member of, even if assigned", () => {
    expect(
      associateMayProducePackage(
        { assignedProducerUserId: "ap-1", members: [{ userId: "ap-1" }, { userId: "student-1" }] },
        "ap-1"
      )
    ).toBe(false);
  });
});

describe("producerMayActOnPackage", () => {
  const assigned = {
    assignedProducerUserId: "ap-1",
    members: [{ userId: "student-1" }]
  };
  const ownPackage = {
    assignedProducerUserId: "ap-1",
    members: [{ userId: "ap-1" }]
  };

  it("restricts associates to assigned packages they are not members of", () => {
    expect(producerMayActOnPackage("ASSOCIATE_PRODUCER", "ap-1", assigned)).toBe(true);
    expect(producerMayActOnPackage("ASSOCIATE_PRODUCER", "ap-1", ownPackage)).toBe(false);
    expect(producerMayActOnPackage("ASSOCIATE_PRODUCER", "ap-2", assigned)).toBe(false);
  });

  it("lets executives and the adviser act on any package", () => {
    expect(producerMayActOnPackage("EXECUTIVE_PRODUCER", "ep-1", assigned)).toBe(true);
    expect(producerMayActOnPackage("ADVISER", "adviser-1", ownPackage)).toBe(true);
    expect(producerMayActOnPackage("SUPER_ADMIN", "admin", ownPackage)).toBe(true);
  });

  it("does not let students act as producers", () => {
    expect(producerMayActOnPackage(null, "student-1", assigned)).toBe(false);
  });
});
