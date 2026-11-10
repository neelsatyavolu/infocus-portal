import { describe, expect, it } from "vitest";
import { BELL_FEED_SOURCE, NO_CLASS_LABEL, planNoClassSync } from "@/src/lib/no-class-days";
import { participationPointsForDate, scheduleKindForDate, type ScheduleKind } from "@/src/lib/school-schedule";
import { parsePalyNoPeriodOneDates } from "@/src/server/paly-bell-schedule";

function calendar(...events: string[]) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.map((event) => `BEGIN:VEVENT\n${event}\nEND:VEVENT`), "END:VCALENDAR"].join("\r\n");
}

function day(uid: string, date: string, next: string, rest: string) {
  return `UID:${uid}\nDTSTART;VALUE=DATE:${date}\nDTEND;VALUE=DATE:${next}\n${rest}`;
}

// Regular Mondays run every period; Nov 9 is pulled out and runs an odd-day schedule instead.
const mondays = `UID:monday
DTSTART;VALUE=DATE:20261102
DTEND;VALUE=DATE:20261103
RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261124T000000Z
EXDATE;VALUE=DATE:20261109
SUMMARY:(0-7) Periods
DESCRIPTION:0 Period (7:55-8:50)1st Period (9:00-9:45)2nd Period (9:55-10:40)`;

const feed = calendar(
  mondays,
  day("odd", "20261109", "20261110", "SUMMARY:(0\\, 5-7\\, PRIME) Periods\nDESCRIPTION:0 Period (7:55-8:50)5th Period (9:00-10:35)PRIME (2:34-3:24)"),
  day("even", "20261110", "20261111", "SUMMARY:(0-4) Periods\nDESCRIPTION:0 Period (7:55-8:50)1st Period (9:00-10:30)"),
  day("thu", "20261112", "20261113", "SUMMARY:(5-7\\, Late Start)\nDESCRIPTION:5th Period (10:05-11:40)"),
  day("blank", "20261117", "20261118", "SUMMARY:Special Schedule\nDESCRIPTION:See the website"),
  day("cancelled", "20261119", "20261120", "STATUS:CANCELLED\nSUMMARY:(5-7) Periods\nDESCRIPTION:5th Period (9:00-10:30)")
);

describe("Paly days without 1st period", () => {
  it("finds days whose schedule lists periods but not 1st period", () => {
    expect(parsePalyNoPeriodOneDates(feed)).toEqual(["2026-11-09", "2026-11-12"]);
  });

  it("does not count days with no evidence: no listed periods or a cancelled schedule", () => {
    const dates = parsePalyNoPeriodOneDates(feed);
    expect(dates).not.toContain("2026-11-17");
    expect(dates).not.toContain("2026-11-19");
    expect(dates).not.toContain("2026-11-16");
  });

  it("recognizes 'Period 1' wording", () => {
    const ics = calendar(day("final", "20261215", "20261216", "SUMMARY:PRIMEs & Final (Period 1)\nDESCRIPTION:Period 1 Final (11:55-1:55)"));
    expect(parsePalyNoPeriodOneDates(ics)).toEqual([]);
  });
});

describe("planNoClassSync", () => {
  const today = "2026-11-10";

  it("turns a Monday into a no-PA day and a Tue/Thu into a 0-point day; leaves Wed/Fri alone", () => {
    const plan = planNoClassSync({ noPeriodOneDates: ["2026-11-09", "2026-11-18", "2026-11-17", "2026-11-13"], existing: [], today });
    expect(plan.upsert).toEqual([
      { date: "2026-11-09", kind: "NONE", label: NO_CLASS_LABEL },
      { date: "2026-11-17", kind: "HOLIDAY", label: NO_CLASS_LABEL }
    ]);

    const overrides = new Map<string, ScheduleKind>(plan.upsert.map((d) => [d.date, d.kind]));
    expect(scheduleKindForDate(new Date("2026-11-09T00:00:00Z"), overrides)).toBe("NONE");
    expect(participationPointsForDate(new Date("2026-11-09T00:00:00Z"), overrides)).toBe(0);
    expect(participationPointsForDate(new Date("2026-11-17T00:00:00Z"), overrides)).toBe(0);
  });

  it("skips built-in holidays and days another source already set", () => {
    const plan = planNoClassSync({
      noPeriodOneDates: ["2026-09-28", "2026-11-23", "2026-11-09", "2026-12-14"],
      existing: [
        { date: "2026-11-09", source: "manual" },
        { date: "2026-12-14", source: "feed" }
      ],
      today
    });
    expect(plan.upsert).toEqual([]);
  });

  it("rewrites its own rows and removes upcoming ones Paly no longer lists, never past ones", () => {
    const plan = planNoClassSync({
      noPeriodOneDates: ["2026-11-16"],
      existing: [
        { date: "2026-11-16", source: BELL_FEED_SOURCE },
        { date: "2026-11-02", source: BELL_FEED_SOURCE },
        { date: "2026-11-30", source: BELL_FEED_SOURCE },
        { date: "2026-12-01", source: "manual" }
      ],
      today
    });
    expect(plan.upsert.map((d) => d.date)).toEqual(["2026-11-16"]);
    expect(plan.remove).toEqual(["2026-11-30"]);
  });
});
