import { describe, expect, it, vi, afterEach } from "vitest";
import { loadPalyClassSessions, parsePalyClassSessions } from "@/src/server/paly-bell-schedule";

function calendar(...events: string[]) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.map((event) => `BEGIN:VEVENT\n${event}\nEND:VEVENT`), "END:VCALENDAR"].join("\r\n");
}

const regular = `UID:regular
DTSTART;VALUE=DATE:20260901
DTEND;VALUE=DATE:20260902
RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20270525T000000Z
EXDATE;VALUE=DATE:20261006,20261124
SUMMARY:Periods 0-4
DESCRIPTION:0 Period (7:55-8:50)1st Period (9:00-10:30)Brunch (10:30-10:45)`;

describe("Paly Period 1 schedule", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("expands regular periods and reads folded descriptions from special schedules", () => {
    const feed = calendar(regular, `UID:special
DTSTART;VALUE=DATE:20261006
DTEND;VALUE=DATE:20261007
SUMMARY:Special Schedule
DESCRIPTION:1st Per\n iod (9:00-9:50)Brunch (9:50-10:05)`);
    expect(parsePalyClassSessions(feed, "2026-10-06", "2026-10-14")).toEqual([
      { date: "2026-10-06", startsAt: "2026-10-06T16:00:00.000Z", endsAt: "2026-10-06T16:50:00.000Z" },
      { date: "2026-10-13", startsAt: "2026-10-13T16:00:00.000Z", endsAt: "2026-10-13T17:30:00.000Z" }
    ]);
  });

  it("uses Pacific winter time and skips excluded holidays, weekends, and dates outside the term", () => {
    expect(parsePalyClassSessions(calendar(regular), "2026-11-17", "2026-11-25")).toEqual([
      { date: "2026-11-17", startsAt: "2026-11-17T17:00:00.000Z", endsAt: "2026-11-17T18:30:00.000Z" }
    ]);
    expect(parsePalyClassSessions(calendar(regular), "2026-09-05", "2026-09-07")).toEqual([]);
    expect(parsePalyClassSessions(calendar(regular), "2027-06-01", "2027-06-08")).toEqual([]);
  });

  it("allows a special Period 1 on a Wednesday and recognizes finals", () => {
    expect(parsePalyClassSessions(calendar(`UID:final
DTSTART;VALUE=DATE:20270317
DTEND;VALUE=DATE:20270318
DESCRIPTION:Period 1 Final (9:00 AM-11:00 AM)`), "2027-03-17", "2027-03-18")).toEqual([
      { date: "2027-03-17", startsAt: "2027-03-17T16:00:00.000Z", endsAt: "2027-03-17T18:00:00.000Z" }
    ]);
  });

  it.each(["DESCRIPTION:5th Period (9:00-10:35)", "DESCRIPTION:Schedule to be announced", "STATUS:CANCELLED\nDESCRIPTION:1st Period (9:00-10:30)"])("does not guess when an explicit replacement has no confirmed class: %s", (description) => {
    expect(parsePalyClassSessions(calendar(regular, `UID:replacement
DTSTART;VALUE=DATE:20260908
DTEND;VALUE=DATE:20260909
${description}`), "2026-09-08", "2026-09-09")).toEqual([]);
  });

  it("honors an updated recurring occurrence", () => {
    expect(parsePalyClassSessions(calendar(regular, `UID:regular
RECURRENCE-ID;VALUE=DATE:20260908
DTSTART;VALUE=DATE:20260908
DTEND;VALUE=DATE:20260909
DESCRIPTION:1st Period (9:15-10:00)`), "2026-09-08", "2026-09-09")[0]).toEqual({
      date: "2026-09-08", startsAt: "2026-09-08T16:15:00.000Z", endsAt: "2026-09-08T17:00:00.000Z"
    });
  });

  it("keeps the board usable when the public feed is unavailable or malformed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await loadPalyClassSessions("2026-09-08", "2026-09-09")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Unavailable</html>")));
    expect(await loadPalyClassSessions("2026-09-08", "2026-09-09")).toEqual([]);
  });
});
