import { DATE_KEY_PATTERN, formatShowDateLabel, formatShowDateShort } from "@/src/lib/show-assignment";

/** GET /api/show-roles/overview payload. */
export type Overview = {
  date: string;
  label: string;
  kind: string;
  mode: "VOLUNTEER" | "RANDOM";
  weekOfMonth: number;
  members: string[];
  roles: string[];
  anchors: string[];
  paAnnouncers: string[];
  assignments: Record<string, string>;
  confirmed: Record<string, boolean>;
  showManager?: { name: string; source: "rotation" | "manual" };
  showManagerPool?: string[];
  rolesConfirmation?: { confirmedAt: string | null; confirmedBy: string | null };
  monthAnchors: string[];
  suggestedAnchors: string[];
  suggestedPa: string[];
  packages: OverviewPackage[];
  upcomingShows: UpcomingShow[];
  teleprompterDocId: string | null;
  teleprompterHref: string;
};

export type OverviewPackage = {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  custom?: boolean;
  queuedForShowDate: string | null;
  members: Array<string | null>;
};

export type UpcomingShow = {
  date: string;
  label: string;
  mode: "VOLUNTEER" | "RANDOM";
  packageCount: number;
  showManager?: string;
};

export type RoleStatus = "confirmed" | "pending" | "unassigned";

export type StripItem = {
  date: string;
  primary: string;
  secondary: string;
  active: boolean;
};

const DAY_MS = 86_400_000;

export function overviewCacheKey(date?: string) {
  return `show-roles-overview:${date ?? ""}`;
}

/** Whole days from today's local midnight to the show date (negative once it has aired). */
export function daysOutFrom(dateKey: string, today: Date): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - midnight.getTime()) / DAY_MS);
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The header's one line of context: Live today / Live in N days / Aired N days ago. A date that
 * isn't a show day (its tag says so) only gets Today / In N days / N days ago.
 */
export function whenLabel(daysOut: number, showDay = true) {
  if (!showDay) {
    if (daysOut === 0) return "Today";
    return daysOut > 0 ? `In ${plural(daysOut, "day")}` : `${plural(-daysOut, "day")} ago`;
  }
  if (daysOut === 0) return "Live today";
  if (daysOut > 0) return `Live in ${plural(daysOut, "day")}`;
  return `Aired ${plural(-daysOut, "day")} ago`;
}

/**
 * Shows are filmed in 1st period on the school day before they air, so the roles check opens the
 * day before (and stays open for past shows).
 */
export function inConfirmationWindow(daysOut: number) {
  return daysOut <= 1;
}

/**
 * Whether the open date is a show day. The overview API reads schedule overrides only from its own
 * today (UTC on Workers, so it can already be tomorrow here) to the last upcoming show, so a
 * non-show `kind` is trusted only from tomorrow through that show. Anywhere else, such as an aired
 * show opened from a reminder email that was a show only by an override, the date counts as one.
 */
export function isShowDay(overview: Pick<Overview, "kind" | "date" | "upcomingShows">, daysOut: number) {
  if (overview.kind === "SHOW") return true;
  const lastLoaded = overview.upcomingShows[overview.upcomingShows.length - 1]?.date;
  return !(daysOut >= 1 && lastLoaded !== undefined && overview.date <= lastLoaded);
}

/**
 * The roles check is due once a show is filmed, until someone confirms. Reminder emails only go out
 * for show days (src/server/show-roles-confirm.ts), so a date known not to be one never asks.
 */
export function needsRolesConfirmation(
  overview: Pick<Overview, "kind" | "date" | "upcomingShows" | "rolesConfirmation">,
  daysOut: number
) {
  return isShowDay(overview, daysOut) && inConfirmationWindow(daysOut) && !overview.rolesConfirmation?.confirmedAt;
}

/** The generator's words for one crew role (src/show-roles/App.jsx statusBadge). */
export function roleStatus(assignee: string | undefined, confirmed: boolean | undefined): RoleStatus {
  if (!assignee) return "unassigned";
  return confirmed ? "confirmed" : "pending";
}

/** Counted over the crew roles only (backups excluded), like the generator. */
function confirmedCount(roles: string[], confirmed: Record<string, boolean>) {
  return roles.filter((role) => Boolean(confirmed[role])).length;
}

export function rolesSummary(overview: Pick<Overview, "roles" | "assignments" | "confirmed">) {
  const assigned = overview.roles.some((role) => Boolean(overview.assignments[role]));
  if (!assigned) return { tone: "neutral" as const, label: "Unassigned" };
  const count = confirmedCount(overview.roles, overview.confirmed);
  return {
    tone: count === overview.roles.length ? ("success" as const) : ("neutral" as const),
    label: `${count}/${overview.roles.length} confirmed`
  };
}

function packagesLabel(count: number) {
  return count === 0 ? "No packages" : plural(count, "package");
}

/** "1 of 2" until the show is full. */
export function packagesTag(count: number, max: number) {
  return count >= max ? { tone: "success" as const, label: "Full" } : { tone: "neutral" as const, label: `${count} of ${max}` };
}

export function openSlotCount(count: number, max: number) {
  return Math.max(0, max - count);
}

/**
 * Cells for the show strip: the next shows, plus the open show when it is not one of them (an
 * emailed link to a show that already aired), placed in date order. The strip only shows with
 * two or more cells (one cell has nothing to switch to).
 */
export function stripItems(overview: Overview, activeDate: string, today: Date): StripItem[] {
  const cells = overview.upcomingShows.map((show) => ({
    date: show.date,
    primary: formatShowDateShort(show.date),
    secondary: [packagesLabel(show.packageCount), show.showManager].filter(Boolean).join(" · "),
    active: show.date === activeDate
  }));
  if (overview.upcomingShows.some((show) => show.date === overview.date)) return cells;
  const aired = daysOutFrom(overview.date, today) < 0;
  const extra: StripItem = {
    date: overview.date,
    primary: formatShowDateShort(overview.date),
    secondary: [aired ? "Aired" : packagesLabel(overview.packages.length), overview.showManager?.name]
      .filter(Boolean)
      .join(" · "),
    active: overview.date === activeDate
  };
  const index = cells.findIndex((cell) => cell.date > extra.date);
  return index < 0 ? [...cells, extra] : [...cells.slice(0, index), extra, ...cells.slice(index)];
}

/** The header title before any show has loaded (a failed load or no show): the asked-for date, if it's one. */
export function fallbackTitle(requestedDate?: string) {
  if (!requestedDate) return "Next show";
  return DATE_KEY_PATTERN.test(requestedDate) ? formatShowDateLabel(requestedDate) : "Unknown date";
}

/** Keeps the open show across the generator round-trip (the generator ignores `date`). */
export function generatorHref(date?: string) {
  return date ? `/show-roles?generator=1&date=${encodeURIComponent(date)}` : "/show-roles?generator=1";
}

export function showHref(date?: string | null) {
  return date ? `/show-roles?date=${encodeURIComponent(date)}` : "/show-roles";
}

/** Show manager choices: the pool, with a hand-picked name that left the pool kept first. */
export function showManagerOptions(name: string, pool: string[]) {
  return name && !pool.includes(name) ? [name, ...pool] : pool;
}
