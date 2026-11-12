/**
 * A minimal iCalendar (RFC 5545) writer for read-only subscription feeds.
 * Lines end in CRLF and are folded at 75 octets; text values are escaped.
 * All-day events use VALUE=DATE; timed events use UTC ("Z") times, so no VTIMEZONE is needed.
 */

export type IcsEventTime = { date: string } | { at: Date };

export type IcsEvent = {
  /** Stable across feed refreshes, so calendar apps update an event instead of duplicating it. */
  uid: string;
  summary: string;
  description?: string;
  url?: string;
  start: IcsEventTime;
  /** All-day: the day after the last day (exclusive). Timed: the end instant. Defaults to one day / the start. */
  end?: IcsEventTime;
};

const CRLF = "\r\n";
const MAX_LINE_OCTETS = 75;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Escapes a TEXT value: backslash, semicolon, comma and newlines (RFC 5545 3.3.11). */
export function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds one content line at 75 octets (UTF-8), never splitting a character (RFC 5545 3.1). */
export function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  // Continuation lines start with a space, which counts toward their 75 octets.
  let limit = MAX_LINE_OCTETS;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

function compactDate(dateKey: string) {
  if (!DATE_KEY.test(dateKey)) {
    throw new Error(`Invalid all-day date: ${dateKey}`);
  }
  return dateKey.replace(/-/g, "");
}

/** 20261111T083000Z */
export function formatIcsUtc(at: Date) {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function nextDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10);
}

function timeLines(event: IcsEvent) {
  if ("date" in event.start) {
    const end = event.end && "date" in event.end ? event.end.date : nextDateKey(event.start.date);
    return [`DTSTART;VALUE=DATE:${compactDate(event.start.date)}`, `DTEND;VALUE=DATE:${compactDate(end)}`];
  }
  const end = event.end && "at" in event.end ? event.end.at : event.start.at;
  return [`DTSTART:${formatIcsUtc(event.start.at)}`, `DTEND:${formatIcsUtc(end)}`];
}

function eventLines(event: IcsEvent, stamp: string) {
  return [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${stamp}`,
    ...timeLines(event),
    `SUMMARY:${escapeIcsText(event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    // URI values are not TEXT, so they are not escaped; a feed only ever links to its own origin.
    ...(event.url ? [`URL:${event.url}`] : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT"
  ];
}

export function buildIcsCalendar(input: { name: string; events: IcsEvent[]; now?: Date }) {
  const stamp = formatIcsUtc(input.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//InFocus Portal//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(input.name)}`,
    "X-WR-TIMEZONE:America/Los_Angeles",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...input.events.flatMap((event) => eventLines(event, stamp)),
    "END:VCALENDAR"
  ];
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
