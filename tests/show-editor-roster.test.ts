import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ users: vi.fn(), staff: vi.fn() }));

vi.mock("@/src/lib/prisma", () => ({ prisma: { user: { findMany: mocks.users } } }));
vi.mock("@/src/lib/gradable-roster", async (original) => ({
  ...await original<typeof import("@/src/lib/gradable-roster")>(),
  loadNonGradableEmails: mocks.staff
}));

import { classRoster, ROSTER_MAX, rosterNames } from "@/src/server/show-editor-roster";

const staff = new Set(["adviser@example.edu", "superadmin@example.edu"]);

describe("rosterNames", () => {
  it("leaves staff out (by email, any case), sorted A to Z", () => {
    expect(rosterNames([
      { name: "Sage Stone", email: "sage@example.edu" },
      { name: "Ada Adviser", email: "Adviser@Example.edu" },
      { name: "Abby Ames", email: "abby@example.edu" },
      { name: "Sam Super", email: "superadmin@example.edu" }
    ], staff)).toEqual(["Abby Ames", "Sage Stone"]);
  });

  it("dedupes, trims, and drops empty names without falling back to the email", () => {
    expect(rosterNames([
      { name: " Otto Ortiz ", email: "otto@example.edu" },
      { name: "Otto Ortiz", email: "otto2@example.edu" },
      { name: null, email: "noname@example.edu" },
      { name: "   ", email: "blank@example.edu" }
    ], staff)).toEqual(["Otto Ortiz"]);
  });

  it("stops at 300 names", () => {
    const users = Array.from({ length: 320 }, (_, index) => ({ name: `Student ${String(index).padStart(3, "0")}`, email: null }));
    const names = rosterNames(users, staff);
    expect(names).toHaveLength(ROSTER_MAX);
    expect(names[0]).toBe("Student 000");
  });
});

describe("classRoster", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads names and emails only, and leaves out the staff list", async () => {
    mocks.users.mockResolvedValue([{ name: "Abby Ames", email: "abby@example.edu" }, { name: "Ada Adviser", email: "adviser@example.edu" }]);
    mocks.staff.mockResolvedValue(staff);
    expect(await classRoster()).toEqual(["Abby Ames"]);
    expect(mocks.users).toHaveBeenCalledWith({ select: { name: true, email: true } });
  });
});
