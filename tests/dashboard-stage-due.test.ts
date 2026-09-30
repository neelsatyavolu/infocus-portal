import { describe, expect, it } from "vitest";
import { formatStageDueLabel } from "@/src/server/dashboard-data";

describe("formatStageDueLabel", () => {
  const now = new Date("2026-08-13T07:30:00.000Z");

  it("shows date and days remaining", () => {
    expect(formatStageDueLabel("2026-09-02T00:00:00.000Z", now)).toBe("Due Sep 2 · in 20 days");
    expect(formatStageDueLabel("2026-09-30T00:00:00.000Z", now)).toBe("Due Sep 30 · in 48 days");
  });

  it("handles today, tomorrow, and past dates", () => {
    expect(formatStageDueLabel("2026-08-13T00:00:00.000Z", now)).toBe("Due Aug 13 · today");
    expect(formatStageDueLabel("2026-08-14T00:00:00.000Z", now)).toBe("Due Aug 14 · in 1 day");
    expect(formatStageDueLabel("2026-08-12T00:00:00.000Z", now)).toBe("Due Aug 12 · 1 day ago");
  });

  it("still says today in the Pacific evening", () => {
    expect(formatStageDueLabel("2026-09-29T00:00:00.000Z", new Date("2026-09-30T02:00:00.000Z"))).toBe(
      "Due Sep 29 · today"
    );
  });

  it("returns null for missing or invalid dates", () => {
    expect(formatStageDueLabel(null, now)).toBeNull();
    expect(formatStageDueLabel("not-a-date", now)).toBeNull();
  });
});
