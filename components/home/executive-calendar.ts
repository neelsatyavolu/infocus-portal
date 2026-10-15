import type { NeedItem } from "@/components/home/executive-needs";
import { buildDayModels, dateFromKey } from "@/components/master-calendar/calendar-model";
import { openSlotLabel } from "@/src/lib/class-board";
import { deadlineClosesAt, pacificDateKey } from "@/src/lib/deadlines";
import { resolveScheduleDay, type ScheduleKind } from "@/src/lib/school-schedule";
import { addDaysToDateKey, formatShowDateShort, parseDateKeyUtc } from "@/src/lib/show-assignment";

/**
 * Pure helpers for the executive Home's calendar parts: the Master Calendar's own day model over
 * the next 14 days (show and PA days, anchors, announcers, queued packages), the week's "Needs
 * you" rows from it, and the livestreams.
 */

export const NEEDS_DAYS = 7;
export const UPCOMING_DAYS = 14;

export type CalendarRecords = {
  overrides: Array<{ date: string; kind: string; label: string }>;
  entries: Array<{ date: string; content: string }>;
  queued: Array<{ id: string; groupTopic: string; cycleNumber: number; queuedForShowDate: string | null }>;
  livestreams: Array<{
    id: string;
    title: string;
    startsAt: Date;
    capacity: number;
    _count: { attendees: number; signups: number };
  }>;
};

export type ShowDayRow = {
  dateKey: string;
  dateLabel: string;
  kind: "SHOW" | "PA";
  /** A special show's calendar label ("Spirit Week Day 1 Recap"). */
  label: string | null;
  anchors: string[];
  paNames: string[];
  packages: Array<{ id: string; title: string }>;
  /** Short tags for what's missing: "No anchors", "1 anchor", "No PA", "Nothing queued". */
  missing: string[];
};

export type LivestreamRow = {
  id: string;
  title: string;
  dateKey: string;
  when: string;
  crew: number;
  capacity: number;
  openLabel: string;
  pending: number;
};

export type WeekEvent = { key: string; kind: "show" | "livestream"; title: string; dateLabel: string; href: string };

function weekdayKeys(todayKey: string, days: number) {
  return Array.from({ length: days }, (_, offset) => addDaysToDateKey(todayKey, offset)).filter((key) => {
    const weekday = parseDateKeyUtc(key).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  });
}

/** Ends at 11:59 PM Pacific that day, like a stage deadline. */
function endOfDay(dateKey: string) {
  return deadlineClosesAt(parseDateKeyUtc(dateKey)).toISOString();
}

function missingTags(day: { kind: string; anchorsNeeded: boolean; paNeeded: boolean; anchors: string[]; paNames: string[]; queue: unknown[] }) {
  const tags: string[] = [];
  if (day.anchorsNeeded) tags.push(day.anchors.length === 0 ? "No anchors" : "1 anchor");
  if (day.paNeeded) tags.push(day.paNames.length === 0 ? "No PA" : "1 announcer");
  if (day.kind === "SHOW" && day.queue.length === 0) tags.push("Nothing queued");
  return tags;
}

function needsFor(row: ShowDayRow): NeedItem[] {
  const dueAt = endOfDay(row.dateKey);
  const items: NeedItem[] = [];
  const set = (count: number) => (count === 0 ? "None set" : `${count} of 2 set`);
  if (row.missing.includes("No anchors") || row.missing.includes("1 anchor")) {
    items.push({
      key: `anchors-${row.dateKey}`,
      kind: "anchors",
      title: `Anchors for ${row.dateLabel}`,
      need: set(row.anchors.length),
      href: "/master-calendar",
      dueAt,
      waitingSince: null
    });
  }
  if (row.missing.includes("No PA") || row.missing.includes("1 announcer")) {
    items.push({
      key: `announcers-${row.dateKey}`,
      kind: "announcers",
      title: `PA announcers for ${row.dateLabel}`,
      need: set(row.paNames.length),
      href: "/master-calendar",
      dueAt,
      waitingSince: null
    });
  }
  if (row.missing.includes("Nothing queued")) {
    items.push({
      key: `queue-${row.dateKey}`,
      kind: "queue",
      title: `Package for ${row.dateLabel}`,
      need: "Nothing queued for this show",
      href: "/publishing-queue",
      dueAt,
      waitingSince: null
    });
  }
  return items;
}

function livestreamWhen(startsAt: Date) {
  return startsAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles"
  });
}

/**
 * The next 14 days of show and PA days, the "Needs you" rows for the next 7, the livestreams in
 * the next 14 days, and the week's shows and livestreams for This week.
 */
export function buildCalendarPart(records: CalendarRecords, todayKey: string) {
  const keys = weekdayKeys(todayKey, UPCOMING_DAYS);
  const overrides = new Map(records.overrides.map((row) => [row.date, { kind: row.kind as ScheduleKind, label: row.label }]));
  const days = buildDayModels({
    weeks: [keys.map(dateFromKey)],
    entries: Object.fromEntries(records.entries.map((entry) => [entry.date, entry.content])),
    scheduleDays: keys.map((key) => resolveScheduleDay(key, overrides)),
    queuedPackages: records.queued.map((row) => ({
      id: row.id,
      groupTopic: row.groupTopic,
      cycleNumber: row.cycleNumber,
      date: row.queuedForShowDate
    })),
    showManagers: {},
    todayKey,
    // Everyone on this Home can edit the calendar, so the "needed" flags apply.
    canEdit: true
  });

  const showDays: ShowDayRow[] = days
    .filter((day) => day.kind === "SHOW" || day.kind === "PA")
    .map((day) => ({
      dateKey: day.dateKey,
      dateLabel: formatShowDateShort(day.dateKey),
      kind: day.kind as "SHOW" | "PA",
      label: day.specialLabel,
      anchors: day.anchors,
      paNames: day.paNames,
      packages: day.queue.map((row) => ({ id: row.id, title: row.groupTopic.trim() || "Untitled package" })),
      missing: missingTags(day)
    }));

  const weekEndKey = addDaysToDateKey(todayKey, NEEDS_DAYS);
  const needs = showDays.filter((row) => row.dateKey < weekEndKey).flatMap(needsFor);

  const livestreams: LivestreamRow[] = records.livestreams
    .map((event) => ({ event, dateKey: pacificDateKey(event.startsAt) }))
    .filter(({ dateKey }) => dateKey >= todayKey && dateKey < addDaysToDateKey(todayKey, UPCOMING_DAYS))
    .sort((a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime())
    .map(({ event, dateKey }) => ({
      id: event.id,
      title: event.title,
      dateKey,
      when: livestreamWhen(event.startsAt),
      crew: event._count.attendees,
      capacity: event.capacity,
      openLabel: openSlotLabel(event.capacity - event._count.attendees),
      pending: event._count.signups
    }));

  const weekShows = showDays
    .filter((row) => row.kind === "SHOW" && row.dateKey < weekEndKey)
    .map((row) => ({
      key: `show-${row.dateKey}`,
      kind: "show" as const,
      title: row.label ? `Show · ${row.label}` : "Show",
      dateLabel: row.dateLabel,
      href: "/publishing-queue",
      dateKey: row.dateKey,
      order: 0
    }));
  const weekLivestreams = livestreams
    .filter((row) => row.dateKey < weekEndKey)
    .map((row) => ({
      key: `livestream-${row.id}`,
      kind: "livestream" as const,
      title: row.title,
      dateLabel: row.when,
      href: "/livestreams",
      dateKey: row.dateKey,
      order: 1
    }));
  const events: WeekEvent[] = [...weekShows, ...weekLivestreams]
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.order - b.order)
    .map(({ key, kind, title, dateLabel, href }) => ({ key, kind, title, dateLabel, href }));

  return { needs, showDays, livestreams, events };
}
