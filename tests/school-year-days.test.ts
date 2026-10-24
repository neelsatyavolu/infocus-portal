import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  find: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), setting: vi.fn(), upsert: vi.fn()
}));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    schoolCalendarDay: { findMany: m.find, createMany: m.create, updateMany: m.update, deleteMany: m.remove },
    programSetting: { findUnique: m.setting, upsert: m.upsert }
  }
}));

import { DEFAULT_SCHOOL_YEARS, orderSchoolYears, parseProgramConfig, schoolYearSchema, type SchoolYear } from "@/src/lib/program-config";
import { resolveScheduleDay } from "@/src/lib/school-schedule";
import { planSchoolYearSync, schoolYearDays, schoolYearFromFeed, schoolYearsThrough } from "@/src/lib/school-year-days";
import { listUpcomingShowDates } from "@/src/lib/show-assignment";
import { parsePalySchoolDays } from "@/src/server/paly-bell-schedule";
import { syncSchoolCalendar } from "@/src/server/school-calendar-sync";

const year = (firstDay: string, lastDay: string, firstShowDate: string): SchoolYear => ({ firstDay, lastDay, firstShowDate, source: "manual" });
const next = year("2027-08-12", "2028-06-01", "2027-09-03");

describe("program config", () => {
  it("falls back to today's values when nothing or something unreadable is stored", () => {
    expect(parseProgramConfig(undefined).schoolYears).toEqual(DEFAULT_SCHOOL_YEARS);
    expect(parseProgramConfig({ schoolYears: "nope" }).schoolYears).toEqual(DEFAULT_SCHOOL_YEARS);
    expect(parseProgramConfig({}).calendarSync).toBeNull();
  });

  it("gives a year saved before the second-semester first show existed the default one", () => {
    const stored = { schoolYears: [{ firstDay: "2026-08-13", lastDay: "2027-06-03", firstShowDate: "2026-09-04", source: "manual" }] };
    expect(parseProgramConfig(stored).schoolYears[0].secondSemesterFirstShowDate).toBe("2027-01-08");
  });

  it("refuses a second-semester first show outside the year or before the first show", () => {
    const base = { firstDay: "2026-08-13", lastDay: "2027-06-03", firstShowDate: "2026-09-04" };
    expect(schoolYearSchema.safeParse({ ...base, secondSemesterFirstShowDate: "2026-09-02" }).success).toBe(false);
    expect(schoolYearSchema.safeParse({ ...base, secondSemesterFirstShowDate: "2027-06-04" }).success).toBe(false);
    expect(schoolYearSchema.safeParse({ ...base, secondSemesterFirstShowDate: "2027-01-08" }).success).toBe(true);
  });

  it("orders years and refuses overlapping ones", () => {
    expect(orderSchoolYears([next, ...DEFAULT_SCHOOL_YEARS]).map((entry) => entry.firstDay)).toEqual(["2026-08-13", "2027-08-12"]);
    expect(() => orderSchoolYears([...DEFAULT_SCHOOL_YEARS, year("2027-06-01", "2028-06-01", "2027-09-03")])).toThrow("BAD_REQUEST");
  });
});

describe("days a school year implies", () => {
  const days = schoolYearDays([...DEFAULT_SCHOOL_YEARS, next]);
  const byDate = new Map(days.map((day) => [day.date, day]));

  it("has no shows before the year's first show", () => {
    expect(byDate.get("2027-08-13")).toEqual({ date: "2027-08-13", kind: "NONE", label: "" });
    expect(byDate.get("2027-09-01")?.kind).toBe("NONE");
    expect(byDate.has("2027-09-03")).toBe(false);
    expect(resolveScheduleDay("2027-08-16", byDate).kind).toBe("PA");
  });

  it("has no second-semester shows before its first show", () => {
    expect(byDate.get("2027-01-06")).toEqual({ date: "2027-01-06", kind: "NONE", label: "" });
    expect(byDate.has("2027-01-08")).toBe(false);
    expect(byDate.has("2026-12-16")).toBe(false);
    expect(listUpcomingShowDates("2027-01-05", 2, byDate)).toEqual(["2027-01-08", "2027-01-13"]);
  });

  it("marks summer weekdays off and leaves weekends and the last year's summer alone", () => {
    expect(byDate.get("2027-06-04")).toEqual({ date: "2027-06-04", kind: "HOLIDAY", label: "Summer break" });
    expect(byDate.get("2027-08-11")?.kind).toBe("HOLIDAY");
    expect(byDate.has("2027-06-05")).toBe(false);
    expect(byDate.has("2027-08-12")).toBe(false);
    expect(byDate.has("2028-06-02")).toBe(false);
  });

  it("gives no show dates over the summer", () => {
    expect(listUpcomingShowDates("2027-05-31", 3, byDate)).toEqual(["2027-06-02", "2027-09-03", "2027-09-08"]);
  });

  it("guesses the following years so the calendar never runs out", () => {
    const years = schoolYearsThrough(DEFAULT_SCHOOL_YEARS, "2028-09-01");
    expect(years.map((entry) => entry.firstDay)).toEqual(["2026-08-13", "2027-08-12", "2028-08-10"]);
    expect(years[1]).toEqual({ ...next, secondSemesterFirstShowDate: "2028-01-07", source: "feed" });
    expect(schoolYearsThrough(DEFAULT_SCHOOL_YEARS, "2027-01-01")).toHaveLength(1);
  });
});

describe("a new school year in Paly's calendar", () => {
  const schoolDays = (from: string, count: number) =>
    Array.from({ length: count }, (_, index) => new Date(Date.parse(`${from}T00:00:00Z`) + index * 7 * 86_400_000).toISOString().slice(0, 10));

  it("is read once the calendar lists enough of it, with a first show three weeks in", () => {
    const feed = [...schoolDays("2026-08-18", 40), ...schoolDays("2027-08-17", 41)];
    expect(schoolYearFromFeed(feed, DEFAULT_SCHOOL_YEARS)).toEqual({
      firstDay: "2027-08-17", lastDay: "2028-05-23", firstShowDate: "2027-09-08", source: "feed"
    });
  });

  it("is ignored while it is already saved or only a few stray days", () => {
    expect(schoolYearFromFeed(schoolDays("2026-08-18", 40), DEFAULT_SCHOOL_YEARS)).toBeNull();
    expect(schoolYearFromFeed(schoolDays("2027-08-17", 5), DEFAULT_SCHOOL_YEARS)).toBeNull();
  });

  it("expands weekly bell schedules into school days", () => {
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:a", "DTSTART;VALUE=DATE:20270817", "DTEND;VALUE=DATE:20270818",
      "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20270901T000000Z", "SUMMARY:(0-4) Periods", "END:VEVENT",
      "BEGIN:VEVENT", "UID:b", "DTSTART;VALUE=DATE:20270820", "DTEND;VALUE=DATE:20270821", "STATUS:CANCELLED", "SUMMARY:Off", "END:VEVENT",
      "END:VCALENDAR"].join("\r\n");
    expect(parsePalySchoolDays(ics)).toEqual(["2027-08-17", "2027-08-24", "2027-08-31"]);
  });
});

describe("planning the school-year days", () => {
  const days = schoolYearDays([...DEFAULT_SCHOOL_YEARS, next]);

  it("writes only upcoming days and leaves hand-set and finals days alone", () => {
    const plan = planSchoolYearSync({
      days,
      existing: [{ date: "2027-06-04", source: "feed" }, { date: "2027-06-07", source: "manual" }, { date: "2027-06-08", source: "config" }],
      today: "2027-06-01"
    });
    const dates = plan.upsert.map((day) => day.date);
    expect(dates.slice(0, 2)).toEqual(["2027-06-08", "2027-06-09"]);
    expect(dates).not.toContain("2026-08-14");
    expect(plan.remove).toEqual([]);
  });

  it("removes upcoming generated days the years no longer imply", () => {
    const plan = planSchoolYearSync({
      days,
      existing: [{ date: "2027-08-12", source: "config" }, { date: "2026-08-01", source: "config" }, { date: "2027-08-13", source: "config" }],
      today: "2027-06-01"
    });
    expect(plan.remove).toEqual(["2027-08-12"]);
  });
});

describe("the daily school calendar sync", () => {
  beforeEach(() => {
    Object.values(m).forEach((mock) => mock.mockReset().mockResolvedValue({ count: 0 }));
    m.find.mockResolvedValue([]);
    m.setting.mockResolvedValue({ id: "singleton", cyclesPerSemester: 3, config: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("still writes summer and reports the problem when Paly's calendar is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const status = await syncSchoolCalendar(new Date("2026-10-13T19:00:00Z"));
    expect(status).toMatchObject({ ok: false, finalsDates: [] });
    expect(status.message).toContain("could not be read");
    const written = m.create.mock.calls[0][0].data as Array<{ date: string; kind: string; source: string }>;
    expect(written.find((day) => day.date === "2027-06-04")).toEqual({ date: "2027-06-04", kind: "HOLIDAY", label: "Summer break", source: "config" });
    expect(m.upsert.mock.calls.at(-1)?.[0].update.config.calendarSync).toMatchObject({ ok: false });
  });

  it("marks finals weeks and records a clean run", async () => {
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:f", "DTSTART;VALUE=DATE:20261215", "DTEND;VALUE=DATE:20261216",
      "SUMMARY:Finals Periods (5\\, 6)", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(ics)));
    const status = await syncSchoolCalendar(new Date("2026-10-13T19:00:00Z"));
    expect(status).toMatchObject({ ok: true, finalsDates: ["2026-12-15"], message: "" });
    expect(m.create.mock.calls.at(-1)?.[0].data[0]).toEqual({ date: "2026-12-14", kind: "HOLIDAY", label: "Finals week", source: "feed" });
  });
});
