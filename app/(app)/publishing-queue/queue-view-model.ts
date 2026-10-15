import type { StatusTone } from "@/components/kit/tone";
import {
  UNASSIGNED_SHOW_KEY,
  canManuallyPlaceOnShow,
  groupPastQueueSections,
  groupQueueSections
} from "@/src/lib/publishing-queue";
import { formatShowDateLabel, formatShowDateShort } from "@/src/lib/show-assignment";
import type { OccupiedOn, QueueRow, ShowOption, UpcomingShow } from "./queue-types";

/**
 * Pure helpers that turn the queue API data into what the screen shows. Server-safe: the
 * package page (/publishing-queue/<id>) uses the YouTube status helpers too.
 */

// ---------------------------------------------------------------------------------------------
// YouTube status: one vocabulary for queue rows and the package page.

export type YoutubeStatusKey = "published" | "uploading" | "processing" | "failed" | "none";

export type YoutubeStatusView = { key: YoutubeStatusKey; label: string; tone: StatusTone };

/** The YouTube status column is a free string; anything unknown reads as not published. */
export function youtubeStatusView(status: string | null | undefined): YoutubeStatusView {
  switch (status) {
    case "PUBLISHED":
      return { key: "published", label: "On YouTube", tone: "success" };
    case "UPLOADING":
      return { key: "uploading", label: "Uploading", tone: "neutral" };
    case "PROCESSING":
      return { key: "processing", label: "Processing", tone: "neutral" };
    case "FAILED":
      return { key: "failed", label: "Failed", tone: "danger" };
    default:
      return { key: "none", label: "Not published", tone: "muted" };
  }
}

/** The package page's status sentence (announced with role="status"). */
export function youtubeStatusSentence(status: string | null | undefined): string {
  switch (youtubeStatusView(status).key) {
    case "failed":
      return "Publishing failed. Contact a producer for help.";
    case "uploading":
      return "Uploading to YouTube…";
    case "processing":
      return "YouTube is processing this video.";
    case "published":
      return "Published on YouTube";
    default:
      return "This package has not been published to YouTube yet.";
  }
}

/** "Oct 15, 2026" in school time, or null. */
export function formatPublishedDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles"
  });
}

// ---------------------------------------------------------------------------------------------
// Dates and labels.

/** The API labels a special show "Wednesday, October 15 · Spirit Week Recap". */
const SHOW_LABEL_SEPARATOR = " · ";

/** Splits the API's show label into the date words and the special show's calendar name. */
export function splitShowLabel(label: string): { dateLabel: string; specialName: string | null } {
  const at = label.indexOf(SHOW_LABEL_SEPARATOR);
  if (at < 0) return { dateLabel: label, specialName: null };
  const name = label.slice(at + SHOW_LABEL_SEPARATOR.length).trim();
  return { dateLabel: label.slice(0, at), specialName: name || null };
}

function dateKeyToUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string) {
  return Math.round((dateKeyToUtc(to) - dateKeyToUtc(from)) / 86_400_000);
}

/** "Today", "Tomorrow", "In 5 days", "Yesterday", "3 days ago"; null without today. */
export function relativeDayLabel(date: string, today?: string): string | null {
  if (!today) return null;
  const days = daysBetween(today, date);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  if (days === -1) return "Yesterday";
  return `${-days} days ago`;
}

/** The package's name on the queue. */
export function queueRowTitle(row: Pick<QueueRow, "groupTopic" | "custom">) {
  return row.groupTopic || (row.custom ? "Untitled" : "Untitled group");
}

/** "Added to Wednesday, October 22." when the server says where auto-assign put it. */
export function addedToShowMessage(showDate: string | null | undefined) {
  return showDate ? `Added to ${formatShowDateLabel(showDate)}.` : "Added to the publishing queue.";
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function countOnShow(rows: QueueRow[], date: string, excludeRowId?: string | null) {
  return rows.filter((row) => row.queuedForShowDate === date && row.id !== excludeRowId).length;
}

// ---------------------------------------------------------------------------------------------
// The live rundown, past shows and the at-a-glance summary.

export type ShowView = {
  date: string;
  /** "Wednesday, October 15" */
  dateLabel: string;
  /** "Wed, Oct 15" */
  shortLabel: string;
  /** The calendar name of a special show (auto-assign skips these). */
  specialName: string | null;
  /** "Today", "Tomorrow", "In 5 days". */
  relative: string | null;
  rows: QueueRow[];
  /** The first upcoming show day. */
  isNext: boolean;
  /** One of the upcoming show days the API listed (not an extra future date). */
  upcoming: boolean;
};

export type PastShowView = { date: string; label: string; rows: QueueRow[] };

export type QueueSummary = {
  next: ShowView | null;
  regularCount: number;
  openRegular: number;
  firstOpenRegularDate: string | null;
  openSpecial: number;
  unassignedCount: number;
  liveCount: number;
  youtube: { published: number; inFlight: number; failed: number };
  /** The first failed upload, and whether it sits in Past shows. */
  firstFailed: { id: string; past: boolean } | null;
};

export type QueueView = {
  shows: ShowView[];
  unassigned: QueueRow[];
  past: PastShowView[];
  /** Move targets inside Past shows: past dates, then upcoming shows. */
  pastOptions: ShowOption[];
  summary: QueueSummary;
  /** Newest published packages first (website managers' shortcut). */
  recentPublished: QueueRow[];
};

function isFailed(row: QueueRow) {
  return row.youtubePublication?.status === "FAILED";
}

export function summarizeQueue(input: {
  rows: QueueRow[];
  shows: ShowView[];
  unassigned: QueueRow[];
  past: PastShowView[];
}): QueueSummary {
  const upcomingShows = input.shows.filter((show) => show.upcoming);
  const regular = upcomingShows.filter((show) => !show.specialName);
  const openRegular = regular.filter((show) => show.rows.length === 0);
  const liveRows = [...input.shows.flatMap((show) => show.rows), ...input.unassigned];
  const liveFailed = liveRows.find(isFailed);
  const pastFailed = input.past.flatMap((show) => show.rows).find(isFailed);
  const statuses = input.rows.map((row) => row.youtubePublication?.status);
  return {
    next: upcomingShows[0] ?? null,
    regularCount: regular.length,
    openRegular: openRegular.length,
    firstOpenRegularDate: openRegular[0]?.date ?? null,
    openSpecial: upcomingShows.filter((show) => show.specialName && show.rows.length === 0).length,
    unassignedCount: input.unassigned.length,
    liveCount: liveRows.length,
    youtube: {
      published: statuses.filter((status) => status === "PUBLISHED").length,
      inFlight: statuses.filter((status) => status === "UPLOADING" || status === "PROCESSING").length,
      failed: statuses.filter((status) => status === "FAILED").length
    },
    firstFailed: liveFailed ? { id: liveFailed.id, past: false } : pastFailed ? { id: pastFailed.id, past: true } : null
  };
}

export function recentPublishedRows(rows: QueueRow[], limit = 4) {
  return rows
    .filter((row) => row.youtubePublication?.status === "PUBLISHED")
    .sort((a, b) => (b.youtubePublication?.publishedAt ?? "").localeCompare(a.youtubePublication?.publishedAt ?? ""))
    .slice(0, limit);
}

export function buildQueueView(rows: QueueRow[], upcoming: UpcomingShow[], today?: string): QueueView {
  const upcomingDates = upcoming.map((show) => show.date);
  const labels = new Map(upcoming.map((show) => [show.date, show.label]));
  const sections = groupQueueSections(rows, upcomingDates, today);
  const shows = sections
    .filter((section) => section.date !== UNASSIGNED_SHOW_KEY)
    .map((section): ShowView => {
      const apiLabel = labels.get(section.date);
      // Extra future dates (not in the API's list) get the same date words, never the raw key.
      const { dateLabel, specialName } = apiLabel
        ? splitShowLabel(apiLabel)
        : { dateLabel: formatShowDateLabel(section.date), specialName: null };
      return {
        date: section.date,
        dateLabel,
        shortLabel: formatShowDateShort(section.date),
        specialName,
        relative: relativeDayLabel(section.date, today),
        rows: section.rows,
        isNext: section.date === upcomingDates[0],
        upcoming: labels.has(section.date)
      };
    });
  const unassigned = sections.find((section) => section.date === UNASSIGNED_SHOW_KEY)?.rows ?? [];
  const past = groupPastQueueSections(rows, upcomingDates, today).map((section) => ({
    ...section,
    label: formatShowDateLabel(section.date)
  }));
  const pastDates = new Set(past.map((show) => show.date));
  const pastOptions = [
    ...past.map((show) => ({ date: show.date, label: show.label })),
    ...upcoming.filter((show) => !pastDates.has(show.date))
  ];
  return {
    shows,
    unassigned,
    past,
    pastOptions,
    summary: summarizeQueue({ rows, shows, unassigned, past }),
    recentPublished: recentPublishedRows(rows)
  };
}

// ---------------------------------------------------------------------------------------------
// Move to another show.

export type MoveOptionView = {
  date: string;
  dateLabel: string;
  specialName: string | null;
  /** Packages on that show now (the moving package counts only on its own show). */
  count: number;
  current: boolean;
  /** No room for this package (never the show it is already on). */
  full: boolean;
};

/** The shows a row can move to, plus its current date when that is not in the list. */
export function buildMoveOptions(row: QueueRow, options: ShowOption[], occupiedOn: OccupiedOn): MoveOptionView[] {
  const list = options.map((show): MoveOptionView => {
    const others = occupiedOn(show.date, row.id);
    const current = show.date === row.queuedForShowDate;
    return {
      date: show.date,
      ...splitShowLabel(show.label),
      count: current ? others + 1 : others,
      current,
      full: !current && !canManuallyPlaceOnShow(others)
    };
  });
  const currentDate = row.queuedForShowDate;
  if (currentDate && !options.some((show) => show.date === currentDate)) {
    list.push({
      date: currentDate,
      dateLabel: formatShowDateLabel(currentDate),
      specialName: null,
      count: occupiedOn(currentDate, row.id) + 1,
      current: true,
      full: false
    });
  }
  return list;
}
