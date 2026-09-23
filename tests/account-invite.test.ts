import { describe, expect, it } from "vitest";
import { parseAccountInviteInput } from "@/src/lib/account-invite";

describe("parseAccountInviteInput", () => {
  it("takes a plain email plus a separate name", () => {
    expect(parseAccountInviteInput("Ada@pausd.us", "Ada Lovelace")).toEqual([
      { email: "ada@pausd.us", name: "Ada Lovelace" }
    ]);
  });

  it("does not require email-(Name) syntax", () => {
    expect(parseAccountInviteInput("student@pausd.us")).toEqual([
      { email: "student@pausd.us", name: null }
    ]);
  });

  it("still accepts the legacy email-(Name) paste format", () => {
    expect(parseAccountInviteInput("ada@pausd.us-(Ada Lovelace)")).toEqual([
      { email: "ada@pausd.us", name: "Ada Lovelace" }
    ]);
  });

  it("splits comma-separated emails and applies a shared name only when none is inline", () => {
    expect(parseAccountInviteInput("ada@pausd.us, lo@pausd.us", "Class")).toEqual([
      { email: "ada@pausd.us", name: "Class" },
      { email: "lo@pausd.us", name: "Class" }
    ]);
  });

  it("rejects invalid email", () => {
    expect(() => parseAccountInviteInput("not-an-email", "Ada")).toThrow("BAD_REQUEST");
  });
});
