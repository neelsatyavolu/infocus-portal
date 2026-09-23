import { describe, expect, it } from "vitest";

import { PACKAGE_ROSTER_NOTE_MAX, nextPackageRosterNote } from "@/src/lib/package-roster-notes";

describe("nextPackageRosterNote", () => {
  it("keeps the stored note when the payload omits the field", () => {
    expect(nextPackageRosterNote(undefined, "Maya Chen\nCoach Lee")).toBe("Maya Chen\nCoach Lee");
    expect(nextPackageRosterNote(undefined, undefined)).toBe("");
  });

  it("replaces the stored note when a value is sent", () => {
    expect(nextPackageRosterNote("New name", "Old name")).toBe("New name");
    expect(nextPackageRosterNote("", "Old name")).toBe("");
  });

  it("clamps to the roster note max", () => {
    const tooLong = "x".repeat(PACKAGE_ROSTER_NOTE_MAX + 40);
    expect(nextPackageRosterNote(tooLong, "")).toHaveLength(PACKAGE_ROSTER_NOTE_MAX);
  });
});
