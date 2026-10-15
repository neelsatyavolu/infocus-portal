import { pacificDateKey, pacificWallTimeToUtc } from "@/src/lib/meetings/schedule";

/** The show manager is emailed this often until the show's roles are confirmed. */
export const SHOW_ROLES_REMINDER_INTERVAL_MS = 3 * 60 * 60 * 1000;
// The cron runs on the hour; a run a few minutes early must still count as 3 hours on.
const REMINDER_SLACK_MS = 10 * 60 * 1000;
// No reminders from 9 PM to 7 AM Pacific.
const QUIET_END_HOUR = 7;
const QUIET_START_HOUR = 21;
/** Used when the bell schedule has no class period for the show day. */
export const FALLBACK_FILMED_HOUR = 12;

export function isShowRolesQuietTime(now: Date) {
  const today = pacificDateKey(now);
  return now < pacificWallTimeToUtc(today, QUIET_END_HOUR, 0) || now >= pacificWallTimeToUtc(today, QUIET_START_HOUR, 0);
}

/** Most recent show day on or before `todayKey`: the show still waiting on its roles check. */
export function latestFilmedShowDate(showDates: readonly string[], todayKey: string) {
  return showDates.filter((dateKey) => dateKey <= todayKey).reduce<string | null>(
    (latest, dateKey) => (!latest || dateKey > latest ? dateKey : latest),
    null
  );
}

export function showRolesReminderDue(input: {
  now: Date;
  filmedEndsAt: Date;
  confirmedAt: Date | null;
  lastReminderAt: Date | null;
}) {
  if (input.confirmedAt || input.now < input.filmedEndsAt || isShowRolesQuietTime(input.now)) {
    return false;
  }
  return (
    !input.lastReminderAt ||
    input.now.getTime() - input.lastReminderAt.getTime() >= SHOW_ROLES_REMINDER_INTERVAL_MS - REMINDER_SLACK_MS
  );
}
