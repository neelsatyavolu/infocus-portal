import { describe, expect, it } from "vitest";
import {
  SHOW_ROLES_REMINDER_INTERVAL_MS,
  isShowRolesQuietTime,
  latestFilmedShowDate,
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

describe("latestFilmedShowDate", () => {
  const shows = ["2026-10-09", "2026-10-14", "2026-10-16"];

  it("picks the most recent show on or before today", () => {
    expect(latestFilmedShowDate(shows, "2026-10-14")).toBe("2026-10-14");
    expect(latestFilmedShowDate(shows, "2026-10-15")).toBe("2026-10-14");
    expect(latestFilmedShowDate(shows, "2026-10-13")).toBe("2026-10-09");
  });

  it("is null before the first show", () => {
    expect(latestFilmedShowDate(shows, "2026-10-01")).toBeNull();
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
