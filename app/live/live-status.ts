import { graphicDefinition, type GraphicId } from "@/src/lib/live/graphics";
import {
  activeTags,
  clockMs,
  formatClock,
  ordinalDown,
  periodLabel,
  type ScoreboardState,
  type TagKind
} from "@/src/lib/live/scoreboard";
import type { LiveEventSummary } from "@/src/server/live-graphics";

/** Pure presentation helpers for the Livestream dashboard (no React, no fetches). */

export type DashTab = "thumbnail" | "scoreboard" | "image";

export const DASH_TABS: ReadonlyArray<{ value: DashTab; label: string }> = [
  { value: "thumbnail", label: "Thumbnail" },
  { value: "scoreboard", label: "Scoreboard" },
  { value: "image", label: "Live image" }
];

export function isDashTab(value: unknown): value is DashTab {
  return value === "thumbnail" || value === "scoreboard" || value === "image";
}

const PACIFIC = "America/Los_Angeles";

/** Option text in the livestream picker: "Fri, Oct 17, 7:00 PM · Varsity Boys Basketball vs. Gunn". */
export function formatEventOption(event: LiveEventSummary) {
  const when = new Date(event.startsAt).toLocaleString("en-US", {
    timeZone: PACIFIC,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return `${when} · ${event.title}`;
}

/** "Fri, Oct 17 · 7:00 PM" in Pacific time. */
function formatEventWhen(startsAt: string) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-US", { timeZone: PACIFIC, weekday: "short", month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", { timeZone: PACIFIC, hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

/** The header's one line of context: when, then where. */
export function eventContext(event: LiveEventSummary) {
  return [formatEventWhen(event.startsAt), event.location.trim()].filter(Boolean).join(" · ");
}

export function isPastEvent(eventId: string | null, pastEvents: ReadonlyArray<LiveEventSummary>) {
  return Boolean(eventId) && pastEvents.some((event) => event.id === eventId);
}

export function findEvent(
  eventId: string | null,
  events: ReadonlyArray<LiveEventSummary> | null,
  pastEvents: ReadonlyArray<LiveEventSummary>
) {
  if (!eventId) return null;
  return events?.find((event) => event.id === eventId) ?? pastEvents.find((event) => event.id === eventId) ?? null;
}

export type SaveView = "idle" | "saving" | "retrying" | "saved" | "failed";

/** A quick save shows nothing new; only one that takes this long shows SAVING. */
export const SAVING_DELAY_MS = 500;

/**
 * The scoreboard save state the header shows. It mirrors the save queue; it never drives it.
 * - retrying: a retry timer is waiting.
 * - failed: the last batch was dropped (bad input) and nothing has saved since.
 * - saving: actions have waited or been in flight for SAVING_DELAY_MS or longer.
 * - saved: something saved this session and nothing is waiting.
 */
export function saveView({
  pending,
  pendingForMs,
  retrying,
  failed,
  savedOnce
}: {
  pending: boolean;
  pendingForMs: number;
  retrying: boolean;
  failed: boolean;
  savedOnce: boolean;
}): SaveView {
  if (retrying) return "retrying";
  if (pending && pendingForMs >= SAVING_DELAY_MS) return "saving";
  if (failed) return "failed";
  if (savedOnce) return "saved";
  return "idle";
}

/** Polls in a row that failed before the header says NOT SYNCING (about 8 seconds at 4s). */
export const NOT_SYNCING_AFTER = 2;

/**
 * Something about the scoreboard needs a look, shown as a dot on the Scoreboard tab (and in the
 * phone clock bar) so it stays on screen after the header scrolls away: danger when a change was
 * dropped, warning while a save retries or other devices' changes aren't arriving.
 */
export function scoreboardAlertTone(save: SaveView, notSyncing: boolean): "danger" | "warning" | null {
  if (save === "failed") return "danger";
  if (save === "retrying" || notSyncing) return "warning";
  return null;
}

type BugTag = { id: string; label: string; tone: "warning" | "success" | "neutral" };

const BUG_TAG_TONE: Record<TagKind, BugTag["tone"]> = {
  timeout: "warning",
  flag: "warning",
  touchdown: "success",
  set: "neutral"
};

/** What the scorebug is showing right now beyond the score: timeouts, flag, touchdown, set result. */
export function bugTags(scoreboard: ScoreboardState, now: number): BugTag[] {
  return activeTags(scoreboard, now).map((tag) => ({
    id: tag.id,
    label: tag.kind === "touchdown" ? `Touchdown · ${tag.text}` : tag.text,
    tone: BUG_TAG_TONE[tag.kind]
  }));
}

/** A team name short enough for the phone readout ("VARSITY" → "VARSI"). */
function shortTeamName(name: string, fallback: string, max = 5) {
  const trimmed = name.trim() || fallback;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * The whole game for the phone clock bar, in parts: the period ("Q2", or Other's free text, which
 * may be empty), the time ("4:32"), which always shows, and the score ("PALY 42–38 GUNN"), which is
 * the part cut short first on a narrow phone.
 */
export function gameReadout(scoreboard: ScoreboardState, now: number) {
  const [home, away] = scoreboard.teams;
  return {
    period: periodLabel(scoreboard).trim(),
    time: formatClock(clockMs(scoreboard.clock, now), scoreboard.sport),
    score: `${shortTeamName(home.name, "HOME")} ${home.score}–${away.score} ${shortTeamName(away.name, "AWAY")}`
  };
}

/** The down tag on the football card: "2nd & 7", or null when the down is hidden. */
export function downTag(scoreboard: Pick<ScoreboardState, "down" | "distance">) {
  if (!scoreboard.down) return null;
  return `${ordinalDown(scoreboard.down)} & ${scoreboard.distance || "10"}`;
}

/**
 * True when the queued graphic is the one on air but its fields differ from what was pushed
 * (compared the way the server stores them: each field cut to its limit).
 */
export function queuedDiffersFromAir(
  queued: GraphicId,
  fields: Record<string, string>,
  liveImage: { graphic: GraphicId; fields: Record<string, string> } | null
) {
  if (!liveImage || liveImage.graphic !== queued) return false;
  return graphicDefinition(queued).fields.some(
    (field) => (fields[field.key] ?? "").slice(0, field.max).trim() !== (liveImage.fields[field.key] ?? "").trim()
  );
}

/** "7:42 PM" for when the live image went on air (server time, shown in Pacific). */
export function formatPushedAt(pushedAt: number) {
  if (!Number.isFinite(pushedAt) || pushedAt <= 0) return "";
  return new Date(pushedAt).toLocaleTimeString("en-US", { timeZone: PACIFIC, hour: "numeric", minute: "2-digit" });
}

/** Elements that keep Space for themselves: fields, buttons, and open lists such as the Sport listbox. */
const SPACE_OWNER_TAGS = ["INPUT", "TEXTAREA", "SELECT", "BUTTON"];
const SPACE_OWNER_ROLES = '[role="listbox"],[role="option"],[role="menu"],[role="menuitem"]';

type KeyTarget = { tagName: string; isContentEditable?: boolean; closest?: (selectors: string) => unknown };

/**
 * Space starts and stops the clock from the page itself: not while typing or on a button, not
 * inside an open list (picking a sport with Space), and not when something already handled it.
 */
export function spaceTogglesClock(event: { key: string; repeat: boolean; defaultPrevented: boolean; target: unknown }) {
  if (event.key !== " " || event.repeat || event.defaultPrevented) return false;
  const { target } = event;
  if (typeof target !== "object" || target === null || !("tagName" in target)) return true;
  const element = target as KeyTarget;
  if (element.isContentEditable || SPACE_OWNER_TAGS.includes(element.tagName)) return false;
  return !element.closest?.(SPACE_OWNER_ROLES);
}
