import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({
  prisma: {}
}));

import {
  emailsFromNonGradableAssignments,
  isExcludedFromGrading
} from "@/src/lib/gradable-roster";
import { PLATFORM_SUPER_ADMIN_EMAIL } from "@/src/lib/platform-admin";

describe("gradable roster", () => {
  it("always treats the hardcoded super admin as non-gradable", () => {
    const emails = emailsFromNonGradableAssignments([]);
    expect(emails.has(PLATFORM_SUPER_ADMIN_EMAIL!)).toBe(true);
    expect(
      isExcludedFromGrading({ name: "Neel", email: PLATFORM_SUPER_ADMIN_EMAIL }, emails)
    ).toBe(true);
  });

  it("excludes assigned advisers and executive producers by email", () => {
    const emails = emailsFromNonGradableAssignments([
      { email: "adviser@example.edu" },
      { email: "ep@pausd.us" }
    ]);

    expect(isExcludedFromGrading({ name: "EP", email: "ep@pausd.us" }, emails)).toBe(true);
    expect(isExcludedFromGrading({ name: "Adviser", email: "adviser@example.edu" }, emails)).toBe(
      true
    );
    expect(isExcludedFromGrading({ name: "Student", email: "student@pausd.us" }, emails)).toBe(false);
  });

  it("keeps associate producers and unassigned students", () => {
    const emails = emailsFromNonGradableAssignments([{ email: "ep@pausd.us" }]);
    expect(isExcludedFromGrading({ name: "AP", email: "ap@pausd.us" }, emails)).toBe(false);
    expect(isExcludedFromGrading({ name: "Reporter", email: "reporter@pausd.us" }, emails)).toBe(false);
  });

  it("excludes the configured adviser email without a role assignment", () => {
    const emails = emailsFromNonGradableAssignments([]);
    expect(isExcludedFromGrading({ name: "Pat Adviser", email: "adviser@example.edu" }, emails)).toBe(true);
  });
});
