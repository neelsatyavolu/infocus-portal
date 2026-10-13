import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ find: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: { schoolCalendarDay: { findMany: m.find, createMany: m.create, updateMany: m.update, deleteMany: m.remove } }
}));

import { finalsWeekDays, planFinalsSync } from "@/src/lib/finals-weeks";
import { participationPointsForWeek, resolveScheduleDay, type ScheduleKind } from "@/src/lib/school-schedule";
import { getNextShowDate } from "@/src/lib/teleprompter-template";
import { syncFinalsWeeks } from "@/src/server/finals-calendar-sync";
import { parsePalyFinalsDates } from "@/src/server/paly-bell-schedule";

function calendar(...events: string[]) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.map((event) => `BEGIN:VEVENT\n${event}\nEND:VEVENT`), "END:VCALENDAR"].join("\r\n");
}

function day(uid: string, date: string, next: string, rest: string) {
  return `UID:${uid}\nDTSTART;VALUE=DATE:${date}\nDTEND;VALUE=DATE:${next}\n${rest}`;
}

const feed = calendar(
  `UID:regular
DTSTART;VALUE=DATE:20260901
DTEND;VALUE=DATE:20260902
RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20270525T000000Z
SUMMARY:(0-4) Periods
DESCRIPTION:0 Period (7:55-8:50)1st Period (9:00-10:30)`,
  day("f1", "20261215", "20261216", "SUMMARY:PRIMEs & Final (Period 1)\nDESCRIPTION:PRIME (9:00-10:00)Period 1 Final (11:55-1:55)"),
  day("f2", "20261216", "20261217", "SUMMARY:Finals Periods (5\\, 6)\nDESCRIPTION:Period 5 Final (9:00-11:00)"),
  day("f3", "20270528", "20270529", "DESCRIPTION:Period 4 Final (11:55-1:55)"),
  day("f4", "20270601", "20270602", "SUMMARY:Finals Periods (1\\, 2)"),
  day("off", "20270602", "20270603", "STATUS:CANCELLED\nSUMMARY:Finals Periods (5\\, 6\\, 8)")
);

const FALL_WEEK = ["2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18"];

describe("finals days in the Paly feed", () => {
  it("reads finals days from the summary or the description and skips regular and cancelled days", () => {
    expect(parsePalyFinalsDates(feed)).toEqual(["2026-12-15", "2026-12-16", "2027-05-28", "2027-06-01"]);
  });

  it("rejects something that is not a calendar", () => {
    expect(() => parsePalyFinalsDates("<html></html>")).toThrow();
  });
});

describe("finals weeks", () => {
  it("covers Monday to Friday of every week that has a finals day", () => {
    expect(finalsWeekDays(["2026-12-15", "2026-12-18"])).toEqual(FALL_WEEK);
    expect(finalsWeekDays(["2027-05-28", "2027-06-01"])).toEqual([
      "2027-05-24", "2027-05-25", "2027-05-26", "2027-05-27", "2027-05-28",
      "2027-05-31", "2027-06-01", "2027-06-02", "2027-06-03", "2027-06-04"
    ]);
  });

  it("ignores a weekend date", () => {
    expect(finalsWeekDays(["2026-12-19"])).toEqual([]);
  });

  it("has no PA, no shows and no participation once the week is on the calendar", () => {
    const overrides = new Map(FALL_WEEK.map((date) => [date, { kind: "HOLIDAY" as ScheduleKind, label: "Finals week" }]));
    expect(FALL_WEEK.map((date) => resolveScheduleDay(date, overrides).kind)).toEqual(Array(5).fill("HOLIDAY"));
    expect(resolveScheduleDay("2026-12-14", overrides).label).toBe("Finals week");
    const kinds = new Map(FALL_WEEK.map((date) => [date, "HOLIDAY" as ScheduleKind]));
    expect(participationPointsForWeek(new Date("2026-12-14T00:00:00Z"), kinds)).toBe(0);
    expect(participationPointsForWeek(new Date("2026-12-14T00:00:00Z"))).toBe(50);
  });

  it("skips finals-week shows when picking the next show", () => {
    const overrides = new Map(FALL_WEEK.map((date) => [date, { kind: "HOLIDAY" as ScheduleKind, label: "Finals week" }]));
    const friday = new Date("2026-12-11T20:00:00.000Z");
    expect(getNextShowDate(friday).toISOString().slice(0, 10)).toBe("2026-12-16");
    // Winter break follows, so the next show is the first Wednesday back.
    expect(getNextShowDate(friday, undefined, overrides).toISOString().slice(0, 10)).toBe("2027-01-06");
  });
});

describe("planning a finals sync", () => {
  const today = "2026-10-13";

  it("writes the week, leaving hand-set days and seeded holidays alone", () => {
    const plan = planFinalsSync({
      finalsDates: ["2026-12-15", "2027-06-01"],
      existing: [{ date: "2026-12-14", source: "manual" }, { date: "2026-12-15", source: "feed" }],
      today
    });
    expect(plan.upsert).toEqual(["2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18", "2027-06-01", "2027-06-02", "2027-06-03", "2027-06-04"]);
    expect(plan.remove).toEqual([]);
  });

  it("removes upcoming feed days that are no longer finals, but never past or hand-set ones", () => {
    const plan = planFinalsSync({
      finalsDates: ["2026-12-15"],
      existing: [
        { date: "2026-06-01", source: "feed" },
        { date: "2026-12-07", source: "feed" },
        { date: "2026-12-08", source: "manual" }
      ],
      today
    });
    expect(plan.remove).toEqual(["2026-12-07"]);
  });

  it("changes nothing when the feed lists no finals", () => {
    expect(planFinalsSync({ finalsDates: [], existing: [{ date: "2026-12-15", source: "feed" }], today }))
      .toEqual({ upsert: [], remove: [] });
  });
});

describe("syncing finals weeks", () => {
  beforeEach(() => {
    [m.find, m.create, m.update, m.remove].forEach((mock) => mock.mockReset().mockResolvedValue({ count: 0 }));
    m.find.mockResolvedValue([{ date: "2026-12-14", source: "manual" }, { date: "2026-11-30", source: "feed" }]);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("stores the finals week as feed days and only touches feed rows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(calendar(day("f1", "20261215", "20261216", "SUMMARY:Finals Periods (5\\, 6)")))));
    const result = await syncFinalsWeeks(new Date("2026-10-13T19:00:00Z"));
    const days = ["2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18"];
    expect(result).toEqual({ finalsDates: ["2026-12-15"], written: 4, removed: 1 });
    expect(m.create).toHaveBeenCalledWith({
      data: days.map((date) => ({ date, kind: "HOLIDAY", label: "Finals week", source: "feed" })),
      skipDuplicates: true
    });
    expect(m.update).toHaveBeenCalledWith({
      where: { date: { in: days }, source: "feed" },
      data: { kind: "HOLIDAY", label: "Finals week" }
    });
    expect(m.remove).toHaveBeenCalledWith({ where: { date: { in: ["2026-11-30"] }, source: "feed" } });
  });

  it("fails without writing when the feed is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    await expect(syncFinalsWeeks()).rejects.toThrow();
    expect(m.create).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });
});
