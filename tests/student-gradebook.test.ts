import { describe, expect, it } from "vitest";
import {
  buildParticipationWeeks,
  formatWeekLabel,
  utcDateFromKey,
  utcMondayOf
} from "@/src/lib/student-gradebook";

describe("student gradebook weeks", () => {
  it("anchors a Thursday semester start to the prior Monday", () => {
    expect(utcMondayOf("2026-08-13").toISOString().slice(0, 10)).toBe("2026-08-10");
  });

  it("formats a Monday–Friday week label in UTC", () => {
    expect(formatWeekLabel("2026-08-17")).toBe("Aug 17 – Aug 21");
  });

  it("skips days before the first gradeable participation date", () => {
    const weeks = buildParticipationWeeks({
      semesterStart: utcDateFromKey("2026-08-13"),
      semesterEnd: utcDateFromKey("2026-08-21"),
      entries: [
        { date: utcDateFromKey("2026-08-14"), points: 20 },
        { date: utcDateFromKey("2026-08-17"), points: 10 },
        { date: utcDateFromKey("2026-08-18"), points: 20 }
      ]
    });

    expect(weeks).toHaveLength(1);

    const first = weeks[0];
    expect(first.weekStart).toBe("2026-08-17");
    expect(first.days.map((day) => day.date)).toEqual([
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21"
    ]);
    expect(first.days.find((day) => day.date === "2026-08-18")?.points).toBe(20);
    expect(first.days.find((day) => day.date === "2026-08-19")?.points).toBeNull();
    expect(first.earned).toBe(20);
    expect(first.possible).toBe(20);
    expect(first.fullPossible).toBe(40);
    expect(first.graded).toBe(true);
    expect(first.days.find((day) => day.date === "2026-08-21")?.points).toBeNull();
    expect(first.days.find((day) => day.date === "2026-08-18")?.maxPoints).toBe(20);
    expect(first.days.find((day) => day.date === "2026-08-20")?.maxPoints).toBe(20);
  });

  it("passes producer notes through to each day", () => {
    const weeks = buildParticipationWeeks({
      semesterStart: utcDateFromKey("2026-08-17"),
      semesterEnd: utcDateFromKey("2026-08-21"),
      entries: [{ date: utcDateFromKey("2026-08-18"), points: 10, notes: "Late to class" }]
    });

    expect(weeks[0]?.days.find((day) => day.date === "2026-08-18")?.notes).toBe("Late to class");
    expect(weeks[0]?.days.find((day) => day.date === "2026-08-20")?.notes).toBe("");
  });

  it("marks a week with no entries as ungraded", () => {
    const weeks = buildParticipationWeeks({
      semesterStart: utcDateFromKey("2026-08-24"),
      semesterEnd: utcDateFromKey("2026-08-28"),
      entries: []
    });

    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.graded).toBe(false);
    expect(weeks[0]?.earned).toBe(0);
    expect(weeks[0]?.possible).toBe(0);
    expect(weeks[0]?.fullPossible).toBe(50);
  });
});
