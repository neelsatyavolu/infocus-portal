import { MEETING_TIME_ZONE, pacificDayKey } from "@/src/lib/meetings/client/time";

/**
 * Short day labels for the Meetings tab's lead column ("Today", "Tomorrow", "Wed 15", "Oct 14")
 * and the InFocus Producer Meeting card. All Pacific; pure, so they're easy to test.
 */

const weekdayDayFormat = new Intl.DateTimeFormat("en-US", { timeZone: MEETING_TIME_ZONE, weekday: "short", day: "numeric" });
const monthDayFormat = new Intl.DateTimeFormat("en-US", { timeZone: MEETING_TIME_ZONE, month: "short", day: "numeric" });
const nextLabelFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: MEETING_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric"
});

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * The Pacific day key `offset` calendar days from `dayKey` ("2026-10-05" + 1 → "2026-10-06").
 * Calendar math in UTC, so a DST change never skips or repeats a day.
 */
export function shiftDayKey(dayKey: string, offset: number) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

/** Upcoming lead label: "Today", "Tomorrow", else "Wed 15". `todayKey` is today's pacificDayKey. */
export function upcomingDayLabel(iso: string | Date, todayKey: string) {
  const key = pacificDayKey(iso);
  if (key === todayKey) return "Today";
  if (key === shiftDayKey(todayKey, 1)) return "Tomorrow";
  const parts = Object.fromEntries(weekdayDayFormat.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day}`;
}

/** Past lead label: "Today", else "Oct 14". */
export function pastDayLabel(iso: string | Date, todayKey: string) {
  if (pacificDayKey(iso) === todayKey) return "Today";
  return monthDayFormat.format(new Date(iso));
}

/** "Wed, Oct 15" for the producer meeting card's next date. */
export function shortDateLabel(iso: string | Date) {
  return nextLabelFormat.format(new Date(iso));
}

/** "Sun, Mon and Wed" from 0–6 weekday numbers. */
export function weekdayListLabel(weekdays: readonly number[]) {
  const names = weekdays.map((day) => WEEKDAY_SHORT[day] ?? "");
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "9:15 PM" from a 24-hour wall time. */
export function wallTimeLabel(hour: number, minute: number) {
  const h = hour % 12 || 12;
  return `${h}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
