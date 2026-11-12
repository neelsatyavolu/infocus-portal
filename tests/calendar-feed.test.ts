import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCastNameDirectory } from "@/src/lib/cast-name-directory";
import { buildIcsCalendar, escapeIcsText, foldIcsLine } from "@/src/lib/ics";
import { livestreamEvents, packageDeadlineEvents, showDayEvents } from "@/src/server/calendar-feed-events";
import { calendarFeedPath, createCalendarFeedToken, verifyCalendarFeedToken } from "@/src/server/calendar-feed-token";

const ORIGIN = "https://portal.example.edu";

describe("ICS builder", () => {
  it("escapes text values", () => {
    expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = `SUMMARY:${"é".repeat(60)}`;
    const folded = foldIcsLine(line);
    const encoder = new TextEncoder();
    for (const part of folded.split("\r\n")) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.split("\r\n").map((part, index) => (index === 0 ? part : part.slice(1))).join("")).toBe(line);
  });

  it("writes a CRLF calendar with all-day and UTC events", () => {
    const body = buildIcsCalendar({
      name: "InFocus",
      now: new Date("2026-11-11T12:00:00.000Z"),
      events: [
        { uid: "a@x", summary: "Anchoring, show", start: { date: "2026-11-13" } },
        { uid: "b@x", summary: "Stream", start: { at: new Date("2026-11-14T02:00:00.000Z") }, end: { at: new Date("2026-11-14T04:00:00.000Z") } }
      ]
    });
    expect(body.endsWith("\r\n")).toBe(true);
    expect(body.replace(/\r\n/g, "")).not.toMatch(/\n/);
    expect(body).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
    expect(body).toContain("DTSTART;VALUE=DATE:20261113\r\nDTEND;VALUE=DATE:20261114");
    expect(body).toContain("SUMMARY:Anchoring\\, show");
    expect(body).toContain("DTSTART:20261114T020000Z\r\nDTEND:20261114T040000Z");
    expect(body).toContain("DTSTAMP:20261111T120000Z");
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe("calendar feed token", () => {
  beforeEach(() => {
    vi.stubEnv("APP_AUTH_SECRET", "test-secret-for-calendar-feed");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a user id", () => {
    const token = createCalendarFeedToken("user_abby");
    expect(verifyCalendarFeedToken(token)).toBe("user_abby");
    expect(calendarFeedPath(token)).toMatch(/^\/api\/calendar\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.ics$/);
  });

  it("rejects tampered, swapped and malformed tokens", () => {
    const token = createCalendarFeedToken("user_abby");
    const [id, sig] = token.split(".") as [string, string];
    const other = createCalendarFeedToken("user_otto");
    expect(verifyCalendarFeedToken(`${id}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(verifyCalendarFeedToken(`${other.split(".")[0]}.${sig}`)).toBeNull();
    expect(verifyCalendarFeedToken(id)).toBeNull();
    expect(verifyCalendarFeedToken(`${token}.extra`)).toBeNull();
    expect(verifyCalendarFeedToken("")).toBeNull();
    expect(verifyCalendarFeedToken(null)).toBeNull();
  });

  it("stops verifying when the secret changes", () => {
    const token = createCalendarFeedToken("user_abby");
    vi.stubEnv("APP_AUTH_SECRET", "another-secret");
    expect(verifyCalendarFeedToken(token)).toBeNull();
  });
});

describe("calendar feed route", () => {
  beforeEach(() => {
    vi.stubEnv("APP_AUTH_SECRET", "test-secret-for-calendar-feed");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@/src/server/calendar-feed");
  });

  async function loadRoute() {
    const build = vi.fn(async (userId: string) => (userId === "user_abby" ? "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" : null));
    vi.doMock("@/src/server/calendar-feed", () => ({ buildCalendarFeedForUser: build }));
    const route = await import("@/app/api/calendar/[token]/route");
    return { route, build };
  }

  function call(route: Awaited<ReturnType<typeof loadRoute>>["route"], token: string) {
    return route.GET(new Request(`${ORIGIN}/api/calendar/${token}`), { params: Promise.resolve({ token }) });
  }

  it("serves text/calendar for a valid token", async () => {
    const { route } = await loadRoute();
    const response = await call(route, `${createCalendarFeedToken("user_abby")}.ics`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
  });

  it("404s on invalid or tampered tokens without loading data", async () => {
    const { route, build } = await loadRoute();
    const token = createCalendarFeedToken("user_abby");
    expect((await call(route, "nope.ics")).status).toBe(404);
    expect((await call(route, `${token.slice(0, -2)}xx.ics`)).status).toBe(404);
    expect((await call(route, token)).status).toBe(404);
    expect(build).not.toHaveBeenCalled();
  });

  it("404s when the account is gone", async () => {
    const { route } = await loadRoute();
    expect((await call(route, `${createCalendarFeedToken("user_gone")}.ics`)).status).toBe(404);
  });
});

describe("feed events", () => {
  const users = [
    { id: "u1", name: "Abby Lane", nickname: null, email: "abby@example.edu" },
    { id: "u2", name: "Otto Park", nickname: null, email: "otto@example.edu" },
    { id: "u3", name: "Sage Hill", nickname: null, email: "sage@example.edu" }
  ];
  const directory = buildCastNameDirectory(users);

  it("lists anchor, PA and crew days for the user only", () => {
    const events = showDayEvents(
      "u1",
      [
        { date: "2026-11-13", anchors: ["Abby", "Otto"], paAnnouncers: [], assignments: { "Tech Director": "Sage" } },
        { date: "2026-11-16", anchors: [], paAnnouncers: ["Sage", "Abby"], assignments: {} },
        { date: "2026-11-18", anchors: ["Sage"], paAnnouncers: [], assignments: { "Floor Director": "Abby" } }
      ],
      directory,
      ORIGIN
    );
    expect(events.map((event) => event.uid)).toEqual([
      "anchor-2026-11-13@infocus-portal",
      "pa-2026-11-16@infocus-portal",
      "crew-2026-11-18-floor-director@infocus-portal"
    ]);
    expect(events[0]?.description).toContain("With Otto.");
  });

  it("shifts deadlines by the student's approved extension", () => {
    const cycle = {
      cycleNumber: 3,
      pitchingDate: null,
      proofOfContactDate: new Date("2026-11-02T00:00:00.000Z"),
      aRollBRollDate: null,
      initialCutDate: null,
      finalCutDate: new Date("2026-11-20T00:00:00.000Z")
    };
    const row = {
      id: "row1",
      cycleNumber: 3,
      groupTopic: "Library hours",
      extension: true,
      extensionRequests: [{ requestedDays: 2, grantedDays: 2, grantedUserIds: ["u1"] }]
    };
    const mine = packageDeadlineEvents("u1", [row], new Map([[3, cycle]]), ORIGIN);
    const theirs = packageDeadlineEvents("u2", [row], new Map([[3, cycle]]), ORIGIN);
    const finalCut = (events: typeof mine) => events.find((event) => event.uid === "package-row1-final-cut@infocus-portal");
    expect(finalCut(mine)?.start).toEqual({ date: "2026-11-22" });
    expect(finalCut(mine)?.description).toContain("2-day extension");
    expect(finalCut(theirs)?.start).toEqual({ date: "2026-11-20" });
    expect(mine.find((event) => event.uid.includes("brainstorming"))?.start).toEqual({ date: "2026-11-04" });
  });

  it("marks pending livestream sign-ups and starts at crew arrival", () => {
    const [event] = livestreamEvents(
      [{
        id: "ev1",
        title: "Football",
        startsAt: new Date("2026-11-14T02:00:00.000Z"),
        arrivesAt: new Date("2026-11-14T01:00:00.000Z"),
        location: "Stadium",
        pending: true
      }],
      ORIGIN
    );
    expect(event?.summary).toBe("Livestream: Football (sign-up pending)");
    expect(event?.start).toEqual({ at: new Date("2026-11-14T01:00:00.000Z") });
    expect(event?.end).toEqual({ at: new Date("2026-11-14T04:00:00.000Z") });
  });
});
