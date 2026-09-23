import { describe, expect, it } from "vitest";
import { buildCastPool } from "@/src/lib/cast-pool";

describe("buildCastPool", () => {
  it("lets EPs be picked by hand but keeps them out of random", () => {
    const pool = buildCastPool(
      [
        { name: "Abby Chen", email: "abby@pausd.us" },
        { name: "Lucas Hale", email: "lucas@pausd.us" },
        { name: "Pat Adviser", email: "adviser@example.edu" },
        { name: "Neel Satyavolu", email: "superadmin@example.edu" }
      ],
      ["adviser@example.edu"],
      ["lucas@pausd.us"]
    );

    expect(pool.members).toEqual(["Abby", "Lucas"]);
    expect(pool.randomExempt).toEqual(["Lucas"]);
  });

  it("can keep advisers in the list while still marking them exempt from random", () => {
    const pool = buildCastPool(
      [
        { name: "Abby Chen", email: "abby@pausd.us" },
        { name: "Pat Adviser", email: "adviser@example.edu" },
        { name: "Lucas Hale", email: "lucas@pausd.us" }
      ],
      [],
      ["lucas@pausd.us", "adviser@example.edu"],
      { excludeNames: false }
    );

    expect(pool.members).toEqual(["Abby", "Lucas", "Pat"]);
    expect(pool.randomExempt).toEqual(["Pat", "Lucas"]);
  });

  it("uses nicknames in the member list", () => {
    const pool = buildCastPool(
      [
        { name: "Lucas Hale", nickname: "Lo", email: "lucas@pausd.us" },
        { name: "Abby Chen", nickname: "Abby", email: "abby@pausd.us" }
      ],
      [],
      []
    );

    expect(pool.members).toEqual(["Abby", "Lo"]);
  });
});
