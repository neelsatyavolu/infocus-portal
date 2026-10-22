import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ users: vi.fn(), roles: vi.fn() }));

vi.mock("@/src/lib/prisma", () => ({
  prisma: { user: { findMany: mocks.users }, platformRoleAssignment: { findMany: mocks.roles } }
}));

import { classRoster, ROSTER_MAX, rosterNames } from "@/src/server/show-editor-roster";

const advisers = new Set(["adviser@example.edu"]);

describe("rosterNames", () => {
  it("leaves advisers out (by email, any case), sorted A to Z", () => {
    expect(rosterNames([
      { name: "Sage Stone", email: "sage@example.edu" },
      { name: "Ada Adviser", email: "Adviser@Example.edu" },
      { name: "Abby Ames", email: "abby@example.edu" }
    ], advisers)).toEqual(["Abby Ames", "Sage Stone"]);
  });

  it("dedupes, trims, and drops empty names without falling back to the email", () => {
    expect(rosterNames([
      { name: " Otto Ortiz ", email: "otto@example.edu" },
      { name: "Otto Ortiz", email: "otto2@example.edu" },
      { name: null, email: "noname@example.edu" },
      { name: "   ", email: "blank@example.edu" }
    ], advisers)).toEqual(["Otto Ortiz"]);
  });

  it("stops at 300 names", () => {
    const users = Array.from({ length: 320 }, (_, index) => ({ name: `Student ${String(index).padStart(3, "0")}`, email: null }));
    const names = rosterNames(users, advisers);
    expect(names).toHaveLength(ROSTER_MAX);
    expect(names[0]).toBe("Student 000");
  });
});

describe("classRoster", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps executive producers (students who anchor) and leaves out advisers", async () => {
    mocks.users.mockResolvedValue([
      { name: "Abby Ames", email: "abby@example.edu" },
      { name: "Eve Exec", email: "exec@example.edu" },
      { name: "Ada Adviser", email: "adviser@example.edu" }
    ]);
    mocks.roles.mockResolvedValue([{ email: "Adviser@example.edu" }]);
    expect(await classRoster()).toEqual(["Abby Ames", "Eve Exec"]);
    expect(mocks.users).toHaveBeenCalledWith({ select: { name: true, email: true } });
    expect(mocks.roles).toHaveBeenCalledWith({ where: { role: "ADVISER" }, select: { email: true } });
  });
});
