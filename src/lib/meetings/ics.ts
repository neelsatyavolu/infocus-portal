import { MEETINGS_TIME_ZONE, pacificLocalStamp } from "@/src/lib/meetings/schedule";

/**
 * iCalendar (RFC 5545 / iTIP RFC 5546) invites for the recurring Producer meeting.
 * Pure: callers pass every value (UID, sequence, times); output uses CRLF and folds at 75 octets.
 */

export const PRODUCER_SERIES_RRULE = "FREQ=WEEKLY;BYDAY=SU,MO,WE";
export const MEETING_INVITE_DESCRIPTION = "Encrypted InFocus meeting. Sign in with your InFocus account.";

export type IcsMethod = "REQUEST" | "CANCEL";

export type IcsParty = { email: string; name?: string | null };

export type IcsBase = {
  /** Stable per series, e.g. producers-series@portal.example.edu */
  uid: string;
  sequence: number;
  title: string;
  /** Stable meeting link, used for LOCATION, URL and DESCRIPTION. */
  url: string;
  organizer: IcsParty;
  attendee: IcsParty;
  now: Date;
};

export type MovedOccurrence = { originalStart: Date; start: Date; durationMinutes: number };

const VTIMEZONE_LOS_ANGELES = [
  "BEGIN:VTIMEZONE",
  `TZID:${MEETINGS_TIME_ZONE}`,
  `X-LIC-LOCATION:${MEETINGS_TIME_ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE"
];

/** TEXT value escaping (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line to at most 75 octets per physical line (UTF-8 safe), continuation lines start with a space. */
export function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function utcStamp(instant: Date) {
  return instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** 60 → PT1H, 90 → PT1H30M, 45 → PT45M */
export function icsDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `PT${hours ? `${hours}H` : ""}${rest || !hours ? `${rest}M` : ""}`;
}

function localTime(name: string, instant: Date) {
  return `${name};TZID=${MEETINGS_TIME_ZONE}:${pacificLocalStamp(instant)}`;
}

/** Parameter value: quoted, with characters a quoted value can't hold removed. */
function paramValue(value: string) {
  return `"${value.replace(/["\r\n]/g, "").trim()}"`;
}

function partyLine(kind: "ORGANIZER" | "ATTENDEE", party: IcsParty) {
  const cn = party.name?.trim() ? `;CN=${paramValue(party.name)}` : "";
  const extra = kind === "ATTENDEE" ? ";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE" : "";
  return `${kind}${cn}${extra}:mailto:${party.email.trim()}`;
}

function eventLines(
  base: IcsBase,
  input: {
    start: Date;
    durationMinutes: number;
    recurrence?: { rrule: string; exdates: Date[] };
    recurrenceId?: Date;
    cancelled?: boolean;
  }
) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${base.uid}`,
    `DTSTAMP:${utcStamp(base.now)}`,
    `SEQUENCE:${base.sequence}`,
    ...(input.recurrenceId ? [localTime("RECURRENCE-ID", input.recurrenceId)] : []),
    localTime("DTSTART", input.start),
    `DURATION:${icsDuration(input.durationMinutes)}`,
    ...(input.recurrence ? [`RRULE:${input.recurrence.rrule}`] : []),
    ...(input.recurrence?.exdates.length
      ? [`EXDATE;TZID=${MEETINGS_TIME_ZONE}:${input.recurrence.exdates.map(pacificLocalStamp).join(",")}`]
      : []),
    `SUMMARY:${escapeIcsText(base.title)}`,
    `DESCRIPTION:${escapeIcsText(`${base.url}\n\n${MEETING_INVITE_DESCRIPTION}`)}`,
    `LOCATION:${escapeIcsText(base.url)}`,
    `URL:${base.url}`,
    partyLine("ORGANIZER", base.organizer),
    partyLine("ATTENDEE", base.attendee),
    `STATUS:${input.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT"
  ];
  return lines;
}

function calendar(method: IcsMethod, events: string[][]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//InFocus Portal//Meetings//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    ...VTIMEZONE_LOS_ANGELES,
    ...events.flat(),
    "END:VCALENDAR"
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/**
 * The whole series (METHOD:REQUEST): weekly Sun/Mon/Wed from `firstStart`, with cancelled slots as
 * EXDATE and moved slots as RECURRENCE-ID overrides, so a resend keeps earlier per-occurrence changes.
 */
export function buildSeriesInvite(
  base: IcsBase & { firstStart: Date; durationMinutes: number; moved?: MovedOccurrence[]; cancelledStarts?: Date[] }
) {
  const master = eventLines(base, {
    start: base.firstStart,
    durationMinutes: base.durationMinutes,
    recurrence: { rrule: PRODUCER_SERIES_RRULE, exdates: base.cancelledStarts ?? [] }
  });
  const overrides = (base.moved ?? []).map((entry) =>
    eventLines(base, { start: entry.start, durationMinutes: entry.durationMinutes, recurrenceId: entry.originalStart })
  );
  return calendar("REQUEST", [master, ...overrides]);
}

/** Removes the whole series from the recipient's calendar (METHOD:CANCEL). */
export function buildSeriesCancel(base: IcsBase & { firstStart: Date; durationMinutes: number }) {
  return calendar("CANCEL", [
    eventLines(base, {
      start: base.firstStart,
      durationMinutes: base.durationMinutes,
      recurrence: { rrule: PRODUCER_SERIES_RRULE, exdates: [] },
      cancelled: true
    })
  ]);
}

/** One occurrence moved: same UID, RECURRENCE-ID = its original slot, new DTSTART. */
export function buildOccurrenceUpdate(base: IcsBase & MovedOccurrence) {
  return calendar("REQUEST", [
    eventLines(base, { start: base.start, durationMinutes: base.durationMinutes, recurrenceId: base.originalStart })
  ]);
}

/** One occurrence cancelled: METHOD:CANCEL, RECURRENCE-ID = its original slot, STATUS:CANCELLED. */
export function buildOccurrenceCancel(base: IcsBase & { originalStart: Date; durationMinutes: number }) {
  return calendar("CANCEL", [
    eventLines(base, {
      start: base.originalStart,
      durationMinutes: base.durationMinutes,
      recurrenceId: base.originalStart,
      cancelled: true
    })
  ]);
}

/** A one-off meeting (UID meeting-<id>@<host>): METHOD:REQUEST, created or moved (bump SEQUENCE). */
export function buildEventInvite(base: IcsBase & { start: Date; durationMinutes: number }) {
  return calendar("REQUEST", [eventLines(base, { start: base.start, durationMinutes: base.durationMinutes })]);
}

/** A one-off meeting cancelled, or this attendee taken off it: METHOD:CANCEL, STATUS:CANCELLED. */
export function buildEventCancel(base: IcsBase & { start: Date; durationMinutes: number }) {
  return calendar("CANCEL", [
    eventLines(base, { start: base.start, durationMinutes: base.durationMinutes, cancelled: true })
  ]);
}
