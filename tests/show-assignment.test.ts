import { describe, expect, it } from "vitest";
import { resolveScheduleDay } from "@/src/lib/school-schedule";
import {
  addDaysToDateKey,
  FIRST_SHOW_DATE,
  formatShowDateLabel,
  listShowDatesThrough,
  listUpcomingShowDates,
  monthKeyFromDateKey,
  nextUpcomingShowDate,
  precedingPaDateKey
} from "@/src/lib/show-assignment";

describe("show assignment dates", () => {
  it("starts the 2026-27 season on September 4", () => {
    expect(FIRST_SHOW_DATE).toBe("2026-09-04");
    expect(nextUpcomingShowDate("2026-08-14")).toBe("2026-09-04");
    expect(nextUpcomingShowDate("2026-08-15")).toBe("2026-09-04");
    expect(nextUpcomingShowDate("2026-09-02")).toBe("2026-09-04");
    expect(nextUpcomingShowDate("2026-09-03")).toBe("2026-09-04");
  });

  it("includes today when today is a show day", () => {
    expect(nextUpcomingShowDate("2026-09-04")).toBe("2026-09-04");
  });

  it("skips to the next Wednesday/Friday from a non-show day", () => {
    expect(nextUpcomingShowDate("2026-09-05")).toBe("2026-09-09");
    expect(nextUpcomingShowDate("2026-09-08")).toBe("2026-09-09");
  });

  it("can skip today even on a show day", () => {
    expect(nextUpcomingShowDate("2026-09-04", null, { includeToday: false })).toBe("2026-09-09");
  });

  it("skips seeded holidays when looking for the next show", () => {
    expect(nextUpcomingShowDate("2026-09-07")).toBe("2026-09-09");
  });

  it("honors schedule overrides that move a show", () => {
    const overrides = new Map([
      ["2026-09-09", { kind: "HOLIDAY" as const, label: "Show moved off Wednesday" }],
      ["2026-09-08", { kind: "SHOW" as const, label: "Show moved" }]
    ]);
    expect(nextUpcomingShowDate("2026-09-08", overrides)).toBe("2026-09-08");
    expect(nextUpcomingShowDate("2026-09-09", overrides)).toBe("2026-09-11");
  });

  it("lists the next few show dates", () => {
    expect(listUpcomingShowDates("2026-08-14", 3)).toEqual([
      "2026-09-04",
      "2026-09-09",
      "2026-09-11"
    ]);
  });

  it("lists every show from the first air date through a cutoff", () => {
    expect(listShowDatesThrough("2026-09-04")).toEqual(["2026-09-04"]);
    expect(listShowDatesThrough("2026-08-14")).toEqual([]);
  });

  it("formats a readable show label from a date key", () => {
    expect(formatShowDateLabel("2026-08-14")).toContain("August");
    expect(formatShowDateLabel("2026-08-14")).toContain("14");
    expect(monthKeyFromDateKey("2026-08-14")).toBe("2026-08");
    expect(addDaysToDateKey("2026-08-14", 5)).toBe("2026-08-19");
  });
});

describe("preceding PA day for a show", () => {
  const kindForDate = (dateKey: string) => resolveScheduleDay(dateKey).kind;

  it("treats Wednesday as right after Monday PA", () => {
    expect(precedingPaDateKey("2026-09-16", kindForDate)).toBe("2026-09-14");
  });

  it("also treats Friday as right after that week's Monday PA", () => {
    expect(precedingPaDateKey("2026-09-18", kindForDate)).toBe("2026-09-14");
  });

  it("does not pull last week's PA into a week with no PA", () => {
    expect(precedingPaDateKey("2026-09-09", kindForDate)).toBeNull();
  });

  it("walks past holidays to the most recent PA in the same week", () => {
    const kinds: Record<string, "PA" | "SHOW" | "NONE" | "HOLIDAY"> = {
      "2026-09-16": "SHOW",
      "2026-09-15": "HOLIDAY",
      "2026-09-14": "PA"
    };
    expect(precedingPaDateKey("2026-09-16", (dateKey) => kinds[dateKey] ?? "NONE")).toBe("2026-09-14");
  });
});
