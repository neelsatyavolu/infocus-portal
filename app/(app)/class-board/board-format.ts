import type { StatusToneInput } from "@/components/kit/tone";
import { CALENDAR_CREW_ROLES } from "@/src/lib/calendar-show-content";
import { CLASS_BOARD_TIME_ZONE, type ClassBoardDay, type ClassBoardGate, type RaceDot } from "@/src/lib/class-board";
import type { CapacityTone } from "@/src/lib/livestream";

/** Short gate names that fit seven columns on a TV. */
const TV_GATE_LABELS: Record<string, string> = {
  pitching: "Pitch",
  brainstorming: "Contact",
  "a-roll": "A/B",
  "initial-stage-1": "Init 1",
  "initial-stage-2": "Init 2",
  "initial-stage-3": "Init 3",
  "final-cut": "Final"
};

export function gateTvLabel(gate: Pick<ClassBoardGate, "key" | "label">) {
  return TV_GATE_LABELS[gate.key] ?? gate.label;
}

/** The furthest cleared gate of a lane ("Init 1"), for the "Cleared Init 1" tag. */
export function lastClearedGateLabel(dots: RaceDot[], gates: ClassBoardGate[]) {
  const gate = gates[dots.lastIndexOf("done")];
  return gate ? gateTvLabel(gate) : null;
}

/** The roles the lib writes at the start of a calendar line (src/lib/class-board.ts buildBoardDays). */
const CALENDAR_ROLES: ReadonlySet<string> = new Set(["Anchors", "Manager", "Announcers", "On air", ...CALENDAR_CREW_ROLES]);

/**
 * Calendar lines come from the lib as "Role  Names" (two spaces). Splitting them lets the board
 * draw the role as a caps label so role and name boundaries read apart. Only a known role is
 * split, so free text that happens to hold two spaces (a Class day's own label) stays plain.
 */
export function splitRoleLine(line: string): { role: string | null; value: string } {
  const at = line.indexOf("  ");
  const role = at > 0 ? line.slice(0, at).trim() : "";
  if (!CALENDAR_ROLES.has(role)) return { role: null, value: line.trim() };
  return { role, value: line.slice(at).trim() };
}

/** The literal crew text the lib uses when nobody has signed up. */
export const CREW_OPEN = "Crew open";

/**
 * The board asks the room "who's needed", so any open crew slot is amber and a full crew is calm.
 * Never Danger: an open slot is a call for crew, not an error. (The Livestream Tracker shows open
 * seats neutral to students and amber only to managers, livestreams-model.ts capacityTag.)
 */
export const CAPACITY_TONE: Record<CapacityTone, StatusToneInput> = {
  full: "neutral",
  one: "warning",
  open: "warning"
};

/**
 * One tag per calendar day. A holiday always reads "No school" (a quiet tag on a dimmed row; Danger
 * is never decorative) and its own name, when it has one, moves into the details.
 */
export function dayKindTag(day: Pick<ClassBoardDay, "kind" | "kindLabel">): {
  label: string;
  tone: StatusToneInput;
  note: string | null;
} {
  if (day.kind === "HOLIDAY") {
    const named = day.kindLabel.trim() && day.kindLabel.trim().toLowerCase() !== "no school";
    return { label: "No school", tone: "muted", note: named ? day.kindLabel.trim() : null };
  }
  if (day.kind === "SHOW") return { label: day.kindLabel, tone: "success", note: null };
  if (day.kind === "PA") return { label: day.kindLabel, tone: "warning", note: null };
  return { label: day.kindLabel, tone: "neutral", note: null };
}

const CLOCK_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: CLASS_BOARD_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit"
});

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: CLASS_BOARD_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric"
});

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: CLASS_BOARD_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric"
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: CLASS_BOARD_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit"
});

/** "10:42:07 AM", Pacific. */
export function formatBoardClock(date: Date) {
  return CLOCK_FORMAT.format(date);
}

/** "Thursday, October 15", Pacific. */
export function formatBoardDate(date: Date) {
  return DATE_FORMAT.format(date);
}

/** "Thu, Oct 15", Pacific: the phone nameplate, where the long date would wrap. */
export function formatBoardShortDate(date: Date) {
  return SHORT_DATE_FORMAT.format(date);
}

/** "10:42 AM", Pacific; empty for a bad timestamp. */
export function formatBoardTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : TIME_FORMAT.format(date);
}
