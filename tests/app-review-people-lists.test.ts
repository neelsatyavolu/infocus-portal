import { describe, expect, it } from "vitest";
import { withoutAppReviewUser } from "@/src/lib/prisma";

const HIDE = { OR: [{ email: null }, { NOT: { email: { equals: "review@example.edu", mode: "insensitive" } } }] };

describe("people lists leave out the App Review account", () => {
  it("adds the filter beside any existing condition, keeping people without an email", () => {
    expect(withoutAppReviewUser({}, "review@example.edu")).toEqual({ where: HIDE });
    expect(withoutAppReviewUser({ where: { name: { not: null } }, take: 5 }, "review@example.edu")).toEqual({
      where: { AND: [{ name: { not: null } }, HIDE] },
      take: 5
    });
  });

  it("changes nothing when no review account is configured", () => {
    const args = { where: { email: "sage@example.edu" } };
    expect(withoutAppReviewUser(args, null)).toBe(args);
  });
});
