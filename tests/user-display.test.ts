import { describe, expect, it } from "vitest";
import {
  applyUserDisplayNames,
  labeledUser,
  normalizeNickname,
  userDisplayName
} from "@/src/lib/user-display";

describe("userDisplayName", () => {
  it("prefers nickname over Google name and email", () => {
    expect(
      userDisplayName({
        nickname: "Neel",
        name: "Neel Satyavolu",
        email: "superadmin@example.edu"
      })
    ).toBe("Neel");
  });

  it("falls back to Google name, then email", () => {
    expect(userDisplayName({ nickname: null, name: "Ada Lovelace", email: "ada@example.com" })).toBe(
      "Ada Lovelace"
    );
    expect(userDisplayName({ nickname: "  ", name: null, email: "ada@example.com" })).toBe("ada@example.com");
  });
});

describe("labeledUser", () => {
  it("flattens a roster person to the nickname", () => {
    expect(
      labeledUser({
        nickname: "Lo",
        name: "Lucas Hale",
        email: "lucas@pausd.us"
      })
    ).toEqual({ name: "Lo", email: "lucas@pausd.us" });
  });
});

describe("normalizeNickname", () => {
  it("trims and stores empty as null", () => {
    expect(normalizeNickname("  Neel  ")).toBe("Neel");
    expect(normalizeNickname("   ")).toBeNull();
    expect(normalizeNickname(null)).toBeNull();
  });
});

describe("applyUserDisplayNames", () => {
  it("rewrites user name fields without touching project names", () => {
    const result = applyUserDisplayNames({
      project: { name: "Cycle 1 Feature" },
      members: [
        { name: "Neel Satyavolu", nickname: "Neel", email: "neel@pausd.us" },
        { name: "Lucas Hale", displayName: "Lo", email: "lucas@pausd.us" }
      ]
    });

    expect(result.project.name).toBe("Cycle 1 Feature");
    expect(result.members[0]?.name).toBe("Neel");
    expect(result.members[1]?.name).toBe("Lo");
  });
});
