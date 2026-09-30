import { describe, expect, it } from "vitest";
import {
  participationPointsForDate,
  participationPointsForWeek,
  resolveScheduleDay,
  scheduleKindForDate,
  seededCalendarEntries
} from "@/src/lib/school-schedule";

const utc = (dateKey: string) => new Date(`${dateKey}T00:00:00Z`);

describe("Mondays with no class", () => {
  it("gives no participation on a no-class Monday", () => {
    expect(scheduleKindForDate(utc("2026-09-28"))).toBe("NONE");
    expect(participationPointsForDate(utc("2026-09-28"))).toBe(0);
    expect(resolveScheduleDay("2026-09-28")).toMatchObject({ kind: "NONE", label: "No Monday class" });
  });

  it("keeps PA points on a regular Monday", () => {
    expect(participationPointsForDate(utc("2026-09-21"))).toBe(10);
  });

  it("counts only Tue and Thu class the week of Sep 28", () => {
    expect(participationPointsForWeek(utc("2026-09-28"))).toBe(40);
  });

  it("lets a calendar override win over the list", () => {
    const overrides = new Map([["2026-09-28", "PA" as const]]);
    expect(participationPointsForDate(utc("2026-09-28"), overrides)).toBe(10);
  });

  it("lists the no-class Monday on the calendar seed", () => {
    expect(seededCalendarEntries()).toContainEqual({
      date: "2026-09-28",
      kind: "NONE",
      label: "No Monday class",
      source: "seed"
    });
  });
});
