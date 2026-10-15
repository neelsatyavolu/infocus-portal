import { describe, expect, it } from "vitest";
import {
  SHOW_ROLES_REMINDER_INTERVAL_MS,
  isShowRolesQuietTime,
  latestFilmedShowDate,
  showFilmingEndsAt,
  showRolesReminderDue
} from "@/src/lib/show-roles-confirm";

// October 2026 is PDT (UTC-7).
const pt = (dateKey: string, hhmm: string) => new Date(`${dateKey}T${hhmm}:00-07:00`);

describe("isShowRolesQuietTime", () => {
  it("is quiet from 9 PM to 7 AM Pacific", () => {
    expect(isShowRolesQuietTime(pt("2026-10-14", "06:59"))).toBe(true);
    expect(isShowRolesQuietTime(pt("2026-10-14", "07:00"))).toBe(false);
    expect(isShowRolesQuietTime(pt("2026-10-14", "20:59"))).toBe(false);
    expect(isShowRolesQuietTime(pt("2026-10-14", "21:00"))).toBe(true);
    expect(isShowRolesQuietTime(pt("2026-10-14", "23:30"))).toBe(true);
  });
});

// Paly block schedule: 1st period meets Tue/Thu (9:00-10:30); Wed/Fri shows have none.
const firstPeriod = (dateKey: string) => ({
  date: dateKey,
  startsAt: pt(dateKey, "09:00").toISOString(),
  endsAt: pt(dateKey, "10:30").toISOString()
});
const sessions = ["2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15"].map(firstPeriod);

describe("showFilmingEndsAt", () => {
  it("is the end of 1st period on the school day before the show", () => {
    expect(showFilmingEndsAt("2026-10-14", sessions)).toEqual(pt("2026-10-13", "10:30"));
    expect(showFilmingEndsAt("2026-10-16", sessions)).toEqual(pt("2026-10-15", "10:30"));
  });

  it("falls back to 10:30 AM the day before when the bell schedule has no 1st period", () => {
    expect(showFilmingEndsAt("2026-10-21", sessions)).toEqual(pt("2026-10-20", "10:30"));
  });
});

describe("latestFilmedShowDate", () => {
  const shows = ["2026-10-09", "2026-10-14", "2026-10-16"];

  it("moves to the next show once its 1st period filming ends", () => {
    expect(latestFilmedShowDate(shows, sessions, pt("2026-10-13", "10:00"))).toBe("2026-10-09");
    expect(latestFilmedShowDate(shows, sessions, pt("2026-10-13", "10:30"))).toBe("2026-10-14");
    expect(latestFilmedShowDate(shows, sessions, pt("2026-10-15", "09:30"))).toBe("2026-10-14");
    expect(latestFilmedShowDate(shows, sessions, pt("2026-10-15", "10:30"))).toBe("2026-10-16");
  });

  it("is null before the first show is filmed", () => {
    expect(latestFilmedShowDate(shows, sessions, pt("2026-10-01", "12:00"))).toBeNull();
  });
});

describe("showRolesReminderDue", () => {
  const filmedEndsAt = pt("2026-10-14", "09:30");
  const base = { filmedEndsAt, confirmedAt: null, lastReminderAt: null };

  it("waits until the filming period is over", () => {
    expect(showRolesReminderDue({ ...base, now: pt("2026-10-14", "09:00") })).toBe(false);
    expect(showRolesReminderDue({ ...base, now: pt("2026-10-14", "10:00") })).toBe(true);
  });

  it("repeats every 3 hours, tolerating a late cron run", () => {
    const lastReminderAt = pt("2026-10-14", "10:00");
    expect(showRolesReminderDue({ ...base, lastReminderAt, now: pt("2026-10-14", "12:00") })).toBe(false);
    expect(showRolesReminderDue({ ...base, lastReminderAt, now: new Date(lastReminderAt.getTime() + SHOW_ROLES_REMINDER_INTERVAL_MS - 60_000) })).toBe(true);
    expect(showRolesReminderDue({ ...base, lastReminderAt, now: pt("2026-10-14", "13:00") })).toBe(true);
  });

  it("stops once confirmed", () => {
    expect(
      showRolesReminderDue({ ...base, confirmedAt: pt("2026-10-14", "10:30"), now: pt("2026-10-14", "16:00") })
    ).toBe(false);
  });

  it("holds overnight and sends again at 7 AM", () => {
    const lastReminderAt = pt("2026-10-14", "19:00");
    expect(showRolesReminderDue({ ...base, lastReminderAt, now: pt("2026-10-14", "22:00") })).toBe(false);
    expect(showRolesReminderDue({ ...base, lastReminderAt, now: pt("2026-10-15", "07:00") })).toBe(true);
  });
});
