import { describe, expect, it } from "vitest";
import { signInPageTitle } from "@/src/lib/sign-in-title";

describe("signInPageTitle", () => {
  it("names the page a protected link points to", () => {
    expect(signInPageTitle("/passwords")).toBe("Passwords · InFocus Portal");
  });

  it("uses the product label for known places", () => {
    expect(signInPageTitle("/package-progress")).toBe("Package Cycle · InFocus Portal");
    expect(signInPageTitle("/show-roles")).toBe("The Show · InFocus Portal");
  });

  it("only uses the first path segment and ignores query strings", () => {
    expect(signInPageTitle("/groups/abc123/a-roll?x=1")).toBe("Groups · InFocus Portal");
    expect(signInPageTitle("/master-calendar?week=2")).toBe("Master Calendar · InFocus Portal");
  });

  it("title-cases unknown paths", () => {
    expect(signInPageTitle("/some-new-page")).toBe("Some New Page · InFocus Portal");
  });

  it("falls back to the plain name without a usable return path", () => {
    expect(signInPageTitle(undefined)).toBe("InFocus Portal");
    expect(signInPageTitle("/")).toBe("InFocus Portal");
    expect(signInPageTitle("//evil.com")).toBe("InFocus Portal");
    expect(signInPageTitle("/api/vault")).toBe("InFocus Portal");
  });
});
