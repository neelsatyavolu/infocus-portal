import type { ClassBoardClassSession } from "@/src/lib/class-board";
import { pacificDateKey, pacificWallTimeToUtc } from "@/src/lib/meetings/schedule";
import { addDaysToDateKey } from "@/src/lib/show-assignment";

/** The show manager is emailed this often until the show's roles are confirmed. */
export const SHOW_ROLES_REMINDER_INTERVAL_MS = 3 * 60 * 60 * 1000;
// The cron runs hourly; a run a few minutes early must still count as 3 hours on.
const REMINDER_SLACK_MS = 10 * 60 * 1000;
// No reminders from 9 PM to 7 AM Pacific.
const QUIET_END_HOUR = 7;
const QUIET_START_HOUR = 21;
// The show is filmed in 1st period on the school day before it airs (Tue for Wed, Thu for Fri).
// Paly's block schedule has no 1st period on show days. Look back this far for one.
const FILMING_LOOKBACK_DAYS = 4;
// Bell schedule unreadable: assume 1st period ended 10:30 AM the day before.
const FALLBACK_FILMING_END = { hour: 10, minute: 30 } as const;

export function isShowRolesQuietTime(now: Date) {
  const today = pacificDateKey(now);
  return now < pacificWallTimeToUtc(today, QUIET_END_HOUR, 0) || now >= pacificWallTimeToUtc(today, QUIET_START_HOUR, 0);
}

/** When 1st period on the school day before `showDate` ends: the show is filmed by then. */
export function showFilmingEndsAt(showDate: string, sessions: readonly ClassBoardClassSession[]) {
  const earliest = addDaysToDateKey(showDate, -FILMING_LOOKBACK_DAYS);
  const session = sessions
    .filter((item) => item.date < showDate && item.date >= earliest)
    .reduce<ClassBoardClassSession | null>((latest, item) => (!latest || item.date > latest.date ? item : latest), null);
  return session
    ? new Date(session.endsAt)
    : pacificWallTimeToUtc(addDaysToDateKey(showDate, -1), FALLBACK_FILMING_END.hour, FALLBACK_FILMING_END.minute);
}

/** The most recent show already filmed at `now`: the one whose roles still need checking. */
export function latestFilmedShowDate(showDates: readonly string[], sessions: readonly ClassBoardClassSession[], now: Date) {
  const filmed = showDates.filter((showDate) => showFilmingEndsAt(showDate, sessions) <= now);
  return filmed.reduce<string | null>((latest, dateKey) => (!latest || dateKey > latest ? dateKey : latest), null);
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
