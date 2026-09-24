import { describe, expect, it } from "vitest";
import { N3EL_ANALYTICS_SRC, shouldLoadN3elAnalytics } from "@/src/lib/n3el-analytics";

describe("n3el analytics", () => {
  it("loads the beacon from analytics.n3el.dev", () => {
    expect(N3EL_ANALYTICS_SRC).toBe("https://analytics.n3el.dev/p.js");
  });

  it("loads on regular pages", () => {
    expect(shouldLoadN3elAnalytics("/")).toBe(true);
    expect(shouldLoadN3elAnalytics("/sign-in")).toBe(true);
    expect(shouldLoadN3elAnalytics("/grades")).toBe(true);
    expect(shouldLoadN3elAnalytics("/groups")).toBe(true);
  });

  it("skips guest review links, whose path holds a secret token", () => {
    expect(shouldLoadN3elAnalytics("/g/abc123_token-value")).toBe(false);
  });
});
