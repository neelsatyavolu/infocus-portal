/** Pure time labels and grouping for Messages (inbox times, day dividers, message runs). */

const DAY_MS = 86_400_000;
/** A run (one author name, tight spacing) spans at most this long from its first message. */
export const RUN_GAP_MS = 5 * 60 * 1000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole calendar days from `date` to `now` (0 = today, 1 = yesterday). Rounds over DST shifts. */
export function daysAgo(date: Date, now: Date) {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
}

/** Full stamp for one message: "Oct 3, 2:14 PM". */
export function formatStamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/** "2:14 PM". */
export function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * The time on an inbox row: today shows the time, the last 6 days the weekday ("Mon"), older
 * the month and day ("Oct 3"). Never-opened chats (no time) show nothing.
 */
export function inboxTimeLabel(iso: string | null, now: Date = new Date()) {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const days = daysAgo(date, now);
  if (days <= 0) {
    return formatClock(iso);
  }
  if (days <= 6) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Day divider in a thread: "Today", "Yesterday", or "Mon, Oct 3". */
export function dayLabel(iso: string, now: Date = new Date()) {
  const date = new Date(iso);
  const days = daysAgo(date, now);
  if (days <= 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** The minute a moment falls in (time zone offsets are whole minutes, so local minutes match). */
function minuteOf(iso: string) {
  return Math.floor(new Date(iso).getTime() / 60_000);
}

/**
 * Whether a time label goes under messages[index] of a run: under the last message, and under
 * any message followed by one from a later minute. Messages sent in the same minute share one
 * label, and every message sits right above the label with its own time (minute precision,
 * like formatStamp; the day comes from the day divider).
 */
export function showsTimeAfter(messages: readonly { createdAt: string }[], index: number) {
  const next = messages[index + 1];
  return next === undefined || minuteOf(next.createdAt) !== minuteOf(messages[index].createdAt);
}

type RunMessage = { id: string; createdAt: string; authorId: string };

export type MessageRun<T extends RunMessage> = {
  key: string;
  authorId: string;
  mine: boolean;
  messages: T[];
};

export type ThreadDay<T extends RunMessage> = {
  key: string;
  label: string;
  runs: MessageRun<T>[];
};

/**
 * Splits a chronological thread into days, and each day into runs: consecutive messages from
 * the same author, all within RUN_GAP_MS of the run's first message.
 */
export function groupThread<T extends RunMessage>(messages: readonly T[], meId: string, now: Date = new Date()) {
  const days: ThreadDay<T>[] = [];

  for (const message of messages) {
    const date = new Date(message.createdAt);
    const dayKey = String(startOfDay(date));
    const lastDay = days[days.length - 1];
    if (!lastDay || lastDay.key !== dayKey) {
      days.push({ key: dayKey, label: dayLabel(message.createdAt, now), runs: [] });
    }
    const day = days[days.length - 1];
    const lastRun = day.runs[day.runs.length - 1];
    const continues =
      lastRun !== undefined &&
      lastRun.authorId === message.authorId &&
      date.getTime() - new Date(lastRun.messages[0].createdAt).getTime() <= RUN_GAP_MS;

    if (continues) {
      day.runs[day.runs.length - 1] = { ...lastRun, messages: [...lastRun.messages, message] };
    } else {
      day.runs.push({ key: message.id, authorId: message.authorId, mine: message.authorId === meId, messages: [message] });
    }
  }

  return days;
}
