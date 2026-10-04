import { describe, expect, it } from "vitest";
import {
  buildOccurrenceCancel,
  buildOccurrenceUpdate,
  buildSeriesCancel,
  buildSeriesInvite,
  escapeIcsText,
  foldIcsLine,
  icsDuration,
  type IcsBase
} from "@/src/lib/meetings/ics";
import { producerSlotStart } from "@/src/lib/meetings/schedule";

const base: IcsBase = {
  uid: "producers-series@portal.example.edu",
  sequence: 7,
  title: "Producer meeting",
  url: "https://portal.example.edu/meet/producers",
  organizer: { email: "portal@example.edu", name: "InFocus Portal" },
  attendee: { email: "abby@example.edu", name: "Abby" },
  now: new Date("2026-10-03T19:00:00.000Z")
};

function unfold(ics: string) {
  return ics.replace(/\r\n /g, "");
}

describe("ICS helpers", () => {
  it("escapes TEXT values", () => {
    expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("folds at 75 octets without splitting multi-byte characters", () => {
    const folded = foldIcsLine(`DESCRIPTION:${"é".repeat(60)}`);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").slice(1).every((line) => line.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"é".repeat(60)}`);
    expect(foldIcsLine("SHORT:1")).toBe("SHORT:1");
  });

  it("formats durations", () => {
    expect(icsDuration(60)).toBe("PT1H");
    expect(icsDuration(90)).toBe("PT1H30M");
    expect(icsDuration(45)).toBe("PT45M");
  });
});

describe("buildSeriesInvite", () => {
  const ics = buildSeriesInvite({
    ...base,
    firstStart: producerSlotStart("2026-10-04"),
    durationMinutes: 60,
    cancelledStarts: [producerSlotStart("2026-10-11")],
    moved: [{ originalStart: producerSlotStart("2026-11-01"), start: new Date("2026-11-02T06:00:00.000Z"), durationMinutes: 60 }]
  });
  const text = unfold(ics);

  it("uses CRLF line endings and keeps every physical line within 75 octets", () => {
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("is a REQUEST for a weekly Sun/Mon/Wed series at 21:15 Los Angeles time with a VTIMEZONE", () => {
    expect(text).toContain("METHOD:REQUEST");
    expect(text).toContain("BEGIN:VTIMEZONE\r\nTZID:America/Los_Angeles");
    expect(text).toContain("DTSTART;TZID=America/Los_Angeles:20261004T211500");
    expect(text).toContain("DURATION:PT1H");
    expect(text).toContain("RRULE:FREQ=WEEKLY;BYDAY=SU,MO,WE");
    expect(text).toContain("UID:producers-series@portal.example.edu");
    expect(text).toContain("SEQUENCE:7");
    expect(text).toContain("DTSTAMP:20261003T190000Z");
  });

  it("links the stable meeting page and names organizer and attendee", () => {
    expect(text).toContain("LOCATION:https://portal.example.edu/meet/producers");
    expect(text).toContain("URL:https://portal.example.edu/meet/producers");
    expect(text).toContain(
      "DESCRIPTION:https://portal.example.edu/meet/producers\\n\\nEncrypted InFocus meeting. Sign in with your InFocus account."
    );
    expect(text).toContain('ORGANIZER;CN="InFocus Portal":mailto:portal@example.edu');
    expect(text).toContain('ATTENDEE;CN="Abby";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:abby@example.edu');
  });

  it("carries earlier per-occurrence changes: EXDATE for cancelled, RECURRENCE-ID override for moved", () => {
    expect(text).toContain("EXDATE;TZID=America/Los_Angeles:20261011T211500");
    expect(text).toContain("RECURRENCE-ID;TZID=America/Los_Angeles:20261101T211500");
    // 06:00Z on Nov 2 = 22:00 PST on Nov 1 (after the fall-back change).
    expect(text).toContain("DTSTART;TZID=America/Los_Angeles:20261101T220000");
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe("per-occurrence and series changes", () => {
  it("moves one occurrence with RECURRENCE-ID = its original slot", () => {
    const text = unfold(
      buildOccurrenceUpdate({
        ...base,
        originalStart: producerSlotStart("2027-03-14"),
        start: new Date("2027-03-15T05:00:00.000Z"),
        durationMinutes: 90
      })
    );
    expect(text).toContain("METHOD:REQUEST");
    expect(text).toContain("RECURRENCE-ID;TZID=America/Los_Angeles:20270314T211500");
    expect(text).toContain("DTSTART;TZID=America/Los_Angeles:20270314T220000");
    expect(text).toContain("DURATION:PT1H30M");
    expect(text).not.toContain("RRULE:FREQ=WEEKLY");
  });

  it("cancels one occurrence", () => {
    const text = unfold(buildOccurrenceCancel({ ...base, originalStart: producerSlotStart("2026-11-02"), durationMinutes: 60 }));
    expect(text).toContain("METHOD:CANCEL");
    expect(text).toContain("STATUS:CANCELLED");
    expect(text).toContain("RECURRENCE-ID;TZID=America/Los_Angeles:20261102T211500");
  });

  it("cancels the whole series for one address", () => {
    const text = unfold(buildSeriesCancel({ ...base, firstStart: producerSlotStart("2026-10-04"), durationMinutes: 60 }));
    expect(text).toContain("METHOD:CANCEL");
    expect(text).toContain("STATUS:CANCELLED");
    expect(text).toContain("UID:producers-series@portal.example.edu");
    expect(text).not.toContain("RECURRENCE-ID");
  });

  it("escapes awkward titles and strips quotes from names", () => {
    const text = unfold(
      buildOccurrenceCancel({
        ...base,
        title: "Producers, ops; and \\ more",
        attendee: { email: "otto@example.edu", name: 'Otto "O"' },
        originalStart: producerSlotStart("2026-11-02"),
        durationMinutes: 60
      })
    );
    expect(text).toContain("SUMMARY:Producers\\, ops\\; and \\\\ more");
    expect(text).toContain('ATTENDEE;CN="Otto O";');
  });
});
