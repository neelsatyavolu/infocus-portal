/**
 * Pure helpers for the Master Calendar screen: month math, the per-day model the board and the
 * Day panel read, month status counts, and the package-pill HTML edits. No React, no fetches.
 */
import {
  extractCalendarAnchors,
  extractCalendarCrew,
  extractCalendarPaAnnouncers,
  omitAssignedNamesFromCalendarHtml,
  type CalendarCrewRole
} from "@/src/lib/calendar-show-content";
import {
  defaultTemplateForKind,
  hasImageHidden,
  isScenicImageDay,
  stripImageToken
} from "@/src/lib/master-calendar-cells";
import {
  defaultScheduleKind,
  isSpecialShowDay,
  resolveScheduleDay,
  utcWeekdayFromDateKey,
  type ScheduleKind
} from "@/src/lib/school-schedule";
import { spiritWeekCrewRoles, spiritWeekTheme } from "@/src/lib/spirit-week";

type CalendarEntry = { date: string; content: string };

export type ScheduleDay = { date: string; kind: ScheduleKind; label: string };

export type QueuedCalendarPackage = {
  id: string;
  groupTopic: string;
  cycleNumber: number;
  custom?: boolean;
  date: string | null;
};

export type ShowManagerAssignment = { name: string; source: "rotation" | "manual" };

export type CalendarResponse = {
  month: string;
  canEdit: boolean;
  canViewCastCounts?: boolean;
  entries: CalendarEntry[];
  schedule?: ScheduleDay[];
  queuedPackages?: QueuedCalendarPackage[];
  members?: string[];
  showManagerPool?: string[];
  showManagers?: Record<string, ShowManagerAssignment>;
};

type PackageApprovalStatus = "IN_REVIEW" | "NEEDS_CHANGES" | "APPROVED" | "AIRED";

export type PackageOption = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  currentVersionId: string | null;
  approvalStatus: PackageApprovalStatus | null;
  airedAt: string | null;
};

export type Anchor = { left: number; top: number };

/** A day whose last change failed: a save ("Not saved" on the board) or a Randomize suggestion. */
export type DayFailure = { message: string; kind: "save" | "randomize" };

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
export const AUTO_SYNC_IDLE_MS = 60_000;
export const PACKAGE_TRIGGER = "[package]";
export const CALENDAR_START = { year: 2026, month: 8 } as const;
/** The Day panel's id (the selected day's button points at it with aria-controls). */
export const DAY_PANEL_ID = "master-calendar-day-panel";
export const SCENIC_IMAGE_ALT = "Royalty-free scenic view";
/** The usual week, under the month title. */
export const WEEK_LEGEND = "Mondays PA · Wednesdays and Fridays shows · Tuesdays and Thursdays class · holidays off";

/** Read-only notes and the notes field share one look: 13px text, pills as small green tags. */
const PILL_STYLES =
  "[&_.package-pill]:inline-flex [&_.package-pill]:items-center [&_.package-pill]:rounded-sm [&_.package-pill]:border [&_.package-pill]:border-[rgb(43_179_110/0.30)] [&_.package-pill]:bg-[rgb(43_179_110/0.14)] [&_.package-pill]:px-1.5 [&_.package-pill]:text-xs [&_.package-pill]:font-medium [&_.package-pill]:text-[var(--brand-green)]";
export const NOTES_TEXT_STYLES = `text-left text-[13px] leading-5 text-foreground [&_p]:mb-1 [&_p:last-child]:mb-0 [&_div]:mb-1 [&_strong]:font-semibold [&_em]:italic [&_a]:relative [&_a]:z-10 [&_a]:text-[var(--brand-green)] [&_a]:underline ${PILL_STYLES}`;

// ---------------------------------------------------------------------------------------------
// Dates

function startMonthDate() {
  return new Date(CALENDAR_START.year, CALENDAR_START.month, 1);
}

export function clampToCalendarStart(value: Date) {
  const start = startMonthDate();
  return value < start ? start : new Date(value.getFullYear(), value.getMonth(), 1);
}

export function toMonthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

export function monthCursorFromKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return clampToCalendarStart(new Date(year, month - 1, 1));
}

export function isCalendarStart(monthCursor: Date) {
  return monthCursor.getFullYear() === CALENDAR_START.year && monthCursor.getMonth() === CALENDAR_START.month;
}

export function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today's YYYY-MM-DD in Pacific time (the school's day), for the server's first paint. */
export function pacificDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatMonthTitle(value: Date) {
  return value.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** "Wednesday, October 15" */
export function formatLongDate(dateKey: string) {
  return dateFromKey(dateKey).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** "Wed, Oct 15" */
export function formatShortDate(dateKey: string) {
  return dateFromKey(dateKey).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** "Oct 12 – 16" (or "Oct 30 – Nov 3" across months). */
export function formatDateRange(firstKey: string, lastKey: string) {
  const first = dateFromKey(firstKey);
  const last = dateFromKey(lastKey);
  const start = first.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (firstKey === lastKey) return start;
  const end =
    first.getMonth() === last.getMonth()
      ? String(last.getDate())
      : last.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${start} – ${end}`;
}

/** Weeks of the month, Monday–Friday only; days outside the month are null. */
export function buildWeekRows(monthCursor: Date) {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const weeks: Array<Array<Date | null>> = [];
  let currentWeek = Array<Date | null>(5).fill(null);

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month, day);
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) continue;

    const weekdayIndex = weekday - 1;
    if (weekdayIndex === 0 && currentWeek.some(Boolean)) {
      weeks.push(currentWeek);
      currentWeek = Array<Date | null>(5).fill(null);
    }
    currentWeek = currentWeek.map((value, index) => (index === weekdayIndex ? date : value));
    if (weekdayIndex === 4) {
      weeks.push(currentWeek);
      currentWeek = Array<Date | null>(5).fill(null);
    }
  }

  if (currentWeek.some(Boolean)) weeks.push(currentWeek);
  return weeks;
}

export function entriesRecord(entries: CalendarEntry[]) {
  return Object.fromEntries(entries.map((entry) => [entry.date, entry.content])) as Record<string, string>;
}

export function scheduleFromDays(days: ScheduleDay[] | undefined, dateKey: string): ScheduleDay {
  return days?.find((day) => day.date === dateKey) ?? resolveScheduleDay(dateKey);
}

// ---------------------------------------------------------------------------------------------
// Notes HTML and package pills

export function normalizeEditorHtml(value: string) {
  return value.replace(/​/g, "").trim();
}

export function isRichTextEmpty(value: string) {
  const text = value
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
  return text.length === 0;
}

function escapeHtmlAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPillHtml(packageId: string, label: string) {
  const safeLabel = escapeHtmlAttr(label);
  return `<span class="package-pill" data-package-id="${escapeHtmlAttr(packageId)}" data-display-label="${safeLabel}">${safeLabel}</span>`;
}

export function extractPackageIds(html: string) {
  const ids = new Set<string>();
  if (!html) return ids;
  for (const match of html.matchAll(/data-package-id="([^"]+)"/g)) {
    ids.add(match[1]);
  }
  return ids;
}

function escapeRegExp(value: string) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

/** Rewrites a pill's label attribute and text (the package id, and so the file, stay the same). */
export function renamePillInHtml(html: string, packageId: string, label: string) {
  const pattern = new RegExp(
    `(<span class="package-pill"[^>]*data-package-id="${escapeRegExp(packageId)}"[^>]*data-display-label=")[^"]*("[^>]*>)[^<]*(</span>)`,
    "g"
  );
  const safe = escapeHtmlAttr(label);
  return html.replace(pattern, (_match, open: string, middle: string, close: string) => `${open}${safe}${middle}${safe}${close}`);
}

export function removePillFromHtml(html: string, packageId: string) {
  const id = escapeRegExp(packageId);
  const pattern = new RegExp(
    `<span class="package-pill"[^>]*data-package-id="${id}"[^>]*></span>|<span class="package-pill"[^>]*data-package-id="${id}"[^>]*>[^<]*</span>`,
    "g"
  );
  return html.replace(pattern, "");
}

const APPROVAL_LABELS: Record<PackageApprovalStatus, { label: string; tone: "review" | "warning" | "success" | "neutral" }> = {
  IN_REVIEW: { label: "In review", tone: "review" },
  NEEDS_CHANGES: { label: "Needs changes", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  AIRED: { label: "Aired", tone: "neutral" }
};

export function approvalLabel(status: PackageApprovalStatus | null) {
  return status ? APPROVAL_LABELS[status] ?? null : null;
}

export function queueLabel(row: Pick<QueuedCalendarPackage, "groupTopic" | "cycleNumber" | "custom">) {
  const topic = row.groupTopic || "Untitled";
  return row.custom || row.cycleNumber < 1 ? topic : `${topic} · C${row.cycleNumber}`;
}

// ---------------------------------------------------------------------------------------------
// Day model

/** Crew list labels (Filmers is the older unsorted list: remove or sort only, no Add). */
export const CREW_LABELS: Record<CalendarCrewRole, { label: string; add: string | null }> = {
  Filmers: { label: "Filmers (unsorted)", add: null },
  "Brunch Filmers": { label: "Brunch filmers", add: "Add brunch filmer" },
  "Lunch Filmers": { label: "Lunch filmers", add: "Add lunch filmer" },
  "Night Rally Filmers": { label: "Night rally filmers", add: "Add night rally filmer" },
  Editors: { label: "Editors", add: "Add editor" }
};

const CREW_SHORT: Record<CalendarCrewRole, string> = {
  Filmers: "Unsorted",
  "Brunch Filmers": "Brunch",
  "Lunch Filmers": "Lunch",
  "Night Rally Filmers": "Rally",
  Editors: "Editors"
};

type SpiritDay = {
  theme: string;
  unsorted: string[];
  lists: Array<{ role: CalendarCrewRole; names: string[] }>;
};

export type DayModel = {
  dateKey: string;
  weekdayIndex: number;
  kind: ScheduleKind;
  label: string;
  isToday: boolean;
  isPast: boolean;
  /** Name of a special show (a SHOW day with a label). */
  specialLabel: string | null;
  /** HOLIDAY label when the day has one (the "Holiday" tag shows only then). */
  holidayLabel: string | null;
  /** Someone stored notes that differ from the day's template (a holiday's text is then not its label). */
  customNotes: boolean;
  /** A kind word when the day breaks its weekday's usual pattern ("Show" on a Tuesday). */
  patternTag: string | null;
  anchors: string[];
  manager: ShowManagerAssignment | null;
  queue: QueuedCalendarPackage[];
  paNames: string[];
  spirit: SpiritDay | null;
  imageHidden: boolean;
  /** Read-only notes HTML (class day notes, or the holiday text). */
  displayHtml: string;
  /** HTML the notes field starts from (class and holiday days). */
  editorHtml: string;
  /** Producers only: an upcoming show or PA day with an empty slot. */
  anchorsNeeded: boolean;
  paNeeded: boolean;
};

function patternTagFor(dateKey: string, kind: ScheduleKind, label: string) {
  if (kind === "HOLIDAY") return null;
  const usual = defaultScheduleKind(utcWeekdayFromDateKey(dateKey));
  if (kind === usual) return null;
  if (kind === "SHOW") return "Show";
  if (kind === "PA") return "PA";
  return label || (usual === "PA" ? "No PA" : "No show");
}

function buildDayModel({
  dateKey,
  weekdayIndex,
  schedule,
  rawContent,
  queuedPackages,
  showManager,
  todayKey,
  canEdit
}: {
  dateKey: string;
  weekdayIndex: number;
  schedule: ScheduleDay;
  rawContent: string;
  queuedPackages: QueuedCalendarPackage[];
  showManager: ShowManagerAssignment | undefined;
  todayKey: string | null;
  canEdit: boolean;
}): DayModel {
  const { kind, label } = schedule;
  const storedContent = stripImageToken(rawContent);
  const template = defaultTemplateForKind(kind, label);
  const displayContent = storedContent || template;
  const isShow = kind === "SHOW";
  const isPa = kind === "PA";
  const theme = isShow || isPa ? spiritWeekTheme(dateKey) : null;
  const anchors = isShow ? extractCalendarAnchors(displayContent) : [];
  const paNames = isPa ? extractCalendarPaAnnouncers(displayContent) : [];
  const spirit: SpiritDay | null = theme
    ? {
        theme,
        unsorted: extractCalendarCrew(displayContent, "Filmers"),
        lists: spiritWeekCrewRoles(dateKey).map((role) => ({ role, names: extractCalendarCrew(displayContent, role) }))
      }
    : null;
  const upcoming = todayKey ? dateKey >= todayKey : true;
  const manager = isShow ? showManager ?? null : null;
  const notesHtml =
    kind === "HOLIDAY" ? omitAssignedNamesFromCalendarHtml(displayContent, kind) : isScenicImageDay(kind) ? storedContent : "";

  return {
    dateKey,
    weekdayIndex,
    kind,
    label,
    isToday: dateKey === todayKey,
    isPast: todayKey ? dateKey < todayKey : false,
    specialLabel: isSpecialShowDay(schedule) ? label.trim() : null,
    holidayLabel: kind === "HOLIDAY" && label ? label : null,
    customNotes: storedContent !== "" && normalizeEditorHtml(storedContent) !== normalizeEditorHtml(template),
    patternTag: patternTagFor(dateKey, kind, label),
    anchors,
    manager,
    queue: isShow ? queuedPackages.filter((row) => row.date === dateKey) : [],
    paNames,
    spirit,
    imageHidden: isScenicImageDay(kind) && hasImageHidden(rawContent),
    displayHtml: isRichTextEmpty(notesHtml) ? "" : notesHtml,
    editorHtml: notesHtml,
    anchorsNeeded: canEdit && isShow && upcoming && anchors.length < 2,
    paNeeded: canEdit && isPa && upcoming && paNames.length < 2
  };
}

export function buildDayModels({
  weeks,
  entries,
  scheduleDays,
  queuedPackages,
  showManagers,
  todayKey,
  canEdit
}: {
  weeks: Array<Array<Date | null>>;
  entries: Record<string, string>;
  scheduleDays: ScheduleDay[];
  queuedPackages: QueuedCalendarPackage[];
  showManagers: Record<string, ShowManagerAssignment>;
  todayKey: string | null;
  canEdit: boolean;
}) {
  const scheduleByDate = new Map(scheduleDays.map((day) => [day.date, day]));
  const days: DayModel[] = [];
  for (const week of weeks) {
    week.forEach((date, weekdayIndex) => {
      if (!date) return;
      const dateKey = toDateKey(date);
      days.push(
        buildDayModel({
          dateKey,
          weekdayIndex,
          schedule: scheduleByDate.get(dateKey) ?? resolveScheduleDay(dateKey),
          rawContent: entries[dateKey] ?? "",
          queuedPackages,
          showManager: showManagers[dateKey],
          todayKey,
          canEdit
        })
      );
    });
  }
  return days;
}

/** "Brunch 1 · Lunch 3 · Editors 2" (+ "Unsorted 2"), or "" when nobody is listed. */
export function crewSummary(spirit: SpiritDay) {
  const parts = spirit.lists.filter((list) => list.names.length > 0).map((list) => `${CREW_SHORT[list.role]} ${list.names.length}`);
  if (spirit.unsorted.length > 0) parts.push(`${CREW_SHORT.Filmers} ${spirit.unsorted.length}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------------------------
// Board layout

type WeekSegment = { type: "blank"; key: string } | { type: "day"; key: string; day: DayModel };

export type WeekRow = { key: string; label: string; days: DayModel[]; segments: WeekSegment[]; hasToday: boolean };

/** One row per week: every weekday is its own segment; days outside the month are blanks. */
export function buildWeekSegments(weeks: Array<Array<Date | null>>, dayByKey: ReadonlyMap<string, DayModel>): WeekRow[] {
  return weeks.map((week, weekIndex) => {
    const segments: WeekSegment[] = week.map((date, index) => {
      const day = date ? dayByKey.get(toDateKey(date)) : undefined;
      return day ? { type: "day", key: day.dateKey, day } : { type: "blank", key: `blank-${weekIndex}-${index}` };
    });
    const days = segments.flatMap((segment) => (segment.type === "day" ? [segment.day] : []));
    const label = days.length > 0 ? formatDateRange(days[0].dateKey, days[days.length - 1].dateKey) : "";
    return { key: `week-${weekIndex}`, label, days, segments, hasToday: days.some((day) => day.isToday) };
  });
}

/** A grid segment: a blank, one day, or a run of days off drawn as one bar (each day stays its own button). */
export type BoardSegment = WeekSegment | { type: "run"; key: string; days: DayModel[]; label: string };

/** The text a day off shows when nobody wrote notes on it (its template's label). */
export function holidayText(day: Pick<DayModel, "label">) {
  return day.label.trim() || "No School";
}

function joinsRun(day: DayModel) {
  return day.kind === "HOLIDAY" && !day.customNotes && !day.isToday;
}

/**
 * Merges consecutive days off in a week that share a label and have no notes of their own (two or
 * more) into one run, so a break week is one bar instead of five identical cells. Today and days
 * with notes always keep their own cell.
 */
export function groupHolidayRuns(segments: WeekSegment[]): BoardSegment[] {
  const grouped: BoardSegment[] = [];
  let index = 0;
  while (index < segments.length) {
    const segment = segments[index];
    if (segment.type !== "day" || !joinsRun(segment.day)) {
      grouped.push(segment);
      index += 1;
      continue;
    }
    const label = holidayText(segment.day);
    const run: DayModel[] = [segment.day];
    let next = index + 1;
    for (; next < segments.length; next += 1) {
      const candidate = segments[next];
      if (candidate.type !== "day" || !joinsRun(candidate.day) || holidayText(candidate.day) !== label) break;
      run.push(candidate.day);
    }
    grouped.push(run.length > 1 ? { type: "run", key: `run-${run[0].dateKey}`, days: run, label } : segment);
    index = next;
  }
  return grouped;
}

// ---------------------------------------------------------------------------------------------
// Month status

export type MonthSummary = {
  shows: number;
  paDays: number;
  daysOff: number;
  upcomingCastDays: number;
  showsNeedingAnchors: number;
  paDaysNeedingAnnouncers: number;
};

export function summarizeMonth(days: DayModel[], todayKey: string | null): MonthSummary {
  const upcoming = (day: DayModel) => (todayKey ? day.dateKey >= todayKey : true);
  return {
    shows: days.filter((day) => day.kind === "SHOW").length,
    paDays: days.filter((day) => day.kind === "PA").length,
    daysOff: days.filter((day) => day.kind === "HOLIDAY").length,
    upcomingCastDays: days.filter((day) => upcoming(day) && (day.kind === "SHOW" || day.kind === "PA")).length,
    showsNeedingAnchors: days.filter((day) => day.anchorsNeeded).length,
    paDaysNeedingAnnouncers: days.filter((day) => day.paNeeded).length
  };
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** "8 shows · 4 PA days · 3 days off" */
export function monthCountsLine(summary: Pick<MonthSummary, "shows" | "paDays" | "daysOff">) {
  return [
    plural(summary.shows, "show", "shows"),
    plural(summary.paDays, "PA day", "PA days"),
    summary.daysOff > 0 ? plural(summary.daysOff, "day off", "days off") : null
  ]
    .filter(Boolean)
    .join(" · ");
}

// ---------------------------------------------------------------------------------------------
// Selection

/**
 * The day the Day panel opens on. Producers land on the first upcoming show or PA day that still
 * needs people; everyone else on today (a weekend moves to the next weekday); otherwise the first
 * weekday of the month.
 */
export function defaultSelectedDate(days: DayModel[], monthKey: string, todayKey: string | null, canEdit: boolean) {
  if (days.length === 0) return null;
  if (canEdit) {
    const needed = days.find((day) => day.anchorsNeeded || day.paNeeded);
    if (needed) return needed.dateKey;
  }
  if (todayKey && todayKey.startsWith(monthKey)) {
    const next = days.find((day) => day.dateKey >= todayKey);
    if (next) return next.dateKey;
  }
  return days[0].dateKey;
}

/** The next or previous weekday of the month (no wrapping). */
export function stepDay(days: DayModel[], current: string | null, step: 1 | -1) {
  if (days.length === 0) return null;
  const index = current ? days.findIndex((day) => day.dateKey === current) : -1;
  if (index === -1) return days[0].dateKey;
  return days[index + step]?.dateKey ?? null;
}
