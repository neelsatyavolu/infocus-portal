import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  credential: { findUnique: vi.fn(), upsert: vi.fn() },
  youtubeCredential: { findUnique: vi.fn(), upsert: vi.fn() },
  series: { findUnique: vi.fn(), upsert: vi.fn() },
  meeting: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  invite: { findMany: vi.fn(), updateMany: vi.fn() },
  realUser: vi.fn(),
  allowed: vi.fn(),
  access: vi.fn(),
  cookies: {} as Record<string, string | undefined>
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    googleCalendarCredential: mocks.credential,
    youtubeCredential: mocks.youtubeCredential,
    meetingSeriesCalendar: mocks.series,
    meeting: mocks.meeting,
    meetingInviteEmail: mocks.invite
  }
}));
vi.mock("@/src/lib/auth", () => ({ getRealSessionUser: mocks.realUser }));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/platform-admin")>()),
  isEmailAllowedToUsePlatform: mocks.allowed,
  getPlatformAccess: mocks.access
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (mocks.cookies[name] ? { value: mocks.cookies[name] } : undefined) })
}));
vi.mock("@/src/lib/inngest", () => ({ inngest: { send: vi.fn() } }));

import { GET as callback } from "@/app/api/admin/youtube/callback/route";
import { GET as calendarConnect } from "@/app/api/admin/google-calendar/connect/route";
import { encryptCalendarToken } from "@/src/lib/google-calendar-crypto";
import { createConnectState, verifyConnectState } from "@/src/lib/youtube-credential-crypto";
import { GOOGLE_CALENDAR_CONNECT_COOKIE } from "@/src/server/google-calendar-credential";
import { calendarAttendees, runMeetingCalendarJob } from "@/src/server/meetings-google-calendar";
import { YOUTUBE_CONNECT_COOKIE, YOUTUBE_SCOPES } from "@/src/server/youtube-credential";

const SECRET = "test-auth-secret";
const NOW = new Date("2026-10-03T19:00:00.000Z"); // Saturday noon Pacific
const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const fetchMock = vi.fn();

type Call = { method: string; url: URL; body: Record<string, unknown> | null };
const calls: Call[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Google stub: token refresh, then a table of Calendar responses keyed by "METHOD path". */
function google(routes: Record<string, (call: Call) => Response>) {
  fetchMock.mockImplementation(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.href.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "access-1" });
    const call: Call = { method: init.method ?? "GET", url, body: init.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    const key = `${call.method} ${url.pathname.replace("/calendar/v3/calendars/primary/events", "") || "/"}`;
    // A full sync also lists the series' upcoming instances; none differ unless a test says so.
    const handler = routes[key] ?? (key === "GET /series-1/instances" ? () => json({ items: [] }) : undefined);
    if (!handler) throw new Error(`unexpected ${key}`);
    return handler(call);
  });
}

const rows = [
  { id: "i1", email: "abby@example.edu", userId: "u-abby" },
  { id: "i2", email: "guest@example.edu", userId: null },
  { id: "i3", email: "otto@example.edu", userId: "u-otto" }
];

beforeEach(() => {
  vi.resetAllMocks();
  calls.length = 0;
  mocks.cookies = {};
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("APP_AUTH_SECRET", SECRET);
  vi.stubEnv("APP_BASE_URL", "https://portal.example.edu");
  vi.stubEnv("MEET_APP_URL", "https://meet.example.edu");
  vi.stubEnv("YOUTUBE_CLIENT_ID", "client-id");
  vi.stubEnv("YOUTUBE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("YOUTUBE_CHANNEL_ID", "UCinfocus");
  mocks.credential.findUnique.mockResolvedValue({
    id: "calendar",
    refreshToken: encryptCalendarToken("refresh-1", SECRET),
    accountEmail: "infocus@example.edu",
    connectedAt: NOW
  });
  mocks.invite.findMany.mockResolvedValue(rows);
  mocks.invite.updateMany.mockResolvedValue({ count: 0 });
  mocks.series.upsert.mockResolvedValue({});
  mocks.meeting.findMany.mockResolvedValue([]);
  mocks.meeting.update.mockResolvedValue({});
  mocks.realUser.mockResolvedValue({ userId: "u-admin", email: "admin@example.edu" });
  mocks.allowed.mockResolvedValue(true);
  mocks.access.mockResolvedValue({ canManagePlatformRoles: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("series event", () => {
  it("creates ONE recurring event: RRULE, Los Angeles time, every list email, no Meet link, guests emailed", async () => {
    mocks.series.findUnique.mockResolvedValue(null);
    google({ "POST /": () => json({ id: "series-1" }) });
    await runMeetingCalendarJob({ kind: "sync" }, NOW);

    const create = calls[0];
    expect(create.url.searchParams.get("sendUpdates")).toBe("all");
    expect(create.url.searchParams.get("conferenceDataVersion")).toBe("0");
    expect(create.body).toEqual({
      summary: "InFocus Producer Meeting",
      location: "https://meet.example.edu/producers",
      description: "https://meet.example.edu/producers\n\nEncrypted InFocus meeting. Sign in with your InFocus account.",
      start: { dateTime: "2026-10-04T21:15:00", timeZone: "America/Los_Angeles" },
      end: { dateTime: "2026-10-04T22:15:00", timeZone: "America/Los_Angeles" },
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=SU,MO,WE"],
      attendees: [{ email: "abby@example.edu" }, { email: "guest@example.edu" }, { email: "otto@example.edu" }],
      guestsCanSeeOtherGuests: false,
      reminders: { useDefault: false }
    });
    expect(create.body).not.toHaveProperty("conferenceData");
    expect(mocks.series.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { googleEventId: "series-1" } }));
    expect(mocks.series.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: { lastSyncedAt: NOW, lastSyncError: null } })
    );
  });

  it("reconciles guests: PATCHes the attendee list when an address was added or removed", async () => {
    mocks.series.findUnique.mockResolvedValue({ googleEventId: "series-1" });
    const current = {
      id: "series-1",
      summary: "InFocus Producer Meeting",
      location: "https://meet.example.edu/producers",
      description: "https://meet.example.edu/producers\n\nEncrypted InFocus meeting. Sign in with your InFocus account.",
      attendees: [{ email: "abby@example.edu" }, { email: "removed@example.edu" }]
    };
    google({ "GET /series-1": () => json(current), "PATCH /series-1": () => json({ id: "series-1" }) });
    await runMeetingCalendarJob({ kind: "sync" }, NOW);
    const patch = calls.find((call) => call.method === "PATCH")!;
    expect(patch.url.searchParams.get("sendUpdates")).toBe("all");
    expect(patch.body?.attendees).toEqual([
      { email: "abby@example.edu" },
      { email: "guest@example.edu" },
      { email: "otto@example.edu" }
    ]);
    expect(patch.body).not.toHaveProperty("start");
    expect(patch.body).not.toHaveProperty("recurrence");
  });

  it("does not PATCH (or email anyone) when nothing changed", async () => {
    mocks.series.findUnique.mockResolvedValue({ googleEventId: "series-1" });
    google({
      "GET /series-1": () =>
        json({
          id: "series-1",
          summary: "InFocus Producer Meeting",
          location: "https://meet.example.edu/producers",
          description: "https://meet.example.edu/producers\n\nEncrypted InFocus meeting. Sign in with your InFocus account.",
          attendees: rows.map((row) => ({ email: row.email }))
        })
    });
    await runMeetingCalendarJob({ kind: "sync" }, NOW);
    // Reads the series and its instances; writes nothing.
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET"]);
  });
});

describe("Sync now after the move to the Meetings host", () => {
  const OLD_SERIES = "https://portal.example.edu/meet/producers";
  const NEW_SERIES = "https://meet.example.edu/producers";
  const describe_ = (url: string) => `${url}\n\nEncrypted InFocus meeting. Sign in with your InFocus account.`;

  it("PATCHes the series, a moved instance and a one-off that still carry the old /meet/... link", async () => {
    mocks.series.findUnique.mockResolvedValue({ googleEventId: "series-1" });
    mocks.meeting.findMany.mockResolvedValue([
      { id: "m1", seriesKey: null, occurrenceKey: null, startsAt: new Date("2026-10-10T01:30:00.000Z"), durationMinutes: 45, status: "SCHEDULED", calendarSequence: 1 }
    ]);
    mocks.meeting.findUnique.mockResolvedValue({
      id: "m1",
      title: "Budget review",
      startsAt: new Date("2026-10-10T01:30:00.000Z"),
      durationMinutes: 45,
      status: "SCHEDULED",
      access: "OPEN",
      createdById: "u-sage",
      inviteeUserIds: [],
      seriesKey: null,
      calendarSequence: 1,
      googleEventId: "evt-1"
    });
    google({
      "GET /series-1": () =>
        json({
          id: "series-1",
          summary: "InFocus Producer Meeting",
          location: OLD_SERIES,
          description: describe_(OLD_SERIES),
          attendees: rows.map((row) => ({ email: row.email }))
        }),
      "PATCH /series-1": () => json({}),
      "GET /series-1/instances": () =>
        json({
          items: [
            // Follows the series (already updated): left alone.
            { id: "series-1_20261005T041500Z", summary: "InFocus Producer Meeting", location: NEW_SERIES, description: describe_(NEW_SERIES), start: { dateTime: "2026-10-05T04:15:00Z" } },
            // A moved occurrence keeps its own copy of the old link.
            { id: "series-1_20261102T051500Z", summary: "InFocus Producer Meeting", location: OLD_SERIES, description: describe_(OLD_SERIES), start: { dateTime: "2026-11-01T22:00:00-08:00" } },
            { id: "series-1_20261104T051500Z", status: "cancelled", location: OLD_SERIES }
          ]
        }),
      "PATCH /series-1_20261102T051500Z": () => json({}),
      "GET /evt-1": () =>
        json({
          id: "evt-1",
          summary: "Budget review",
          location: "https://portal.example.edu/meet/m1",
          description: describe_("https://portal.example.edu/meet/m1"),
          start: { dateTime: "2026-10-09T18:30:00-07:00" },
          end: { dateTime: "2026-10-09T19:15:00-07:00" },
          attendees: rows.map((row) => ({ email: row.email }))
        }),
      "PATCH /evt-1": () => json({})
    });

    await runMeetingCalendarJob({ kind: "sync" }, NOW);

    const patches = calls.filter((call) => call.method === "PATCH");
    expect(patches.map((call) => call.url.pathname.split("/").pop())).toEqual(["series-1", "series-1_20261102T051500Z", "evt-1"]);
    for (const patch of patches) expect(patch.url.searchParams.get("sendUpdates")).toBe("all");
    expect(patches[0].body).toMatchObject({ location: NEW_SERIES, description: describe_(NEW_SERIES) });
    expect(patches[1].body).toEqual({ summary: "InFocus Producer Meeting", location: NEW_SERIES, description: describe_(NEW_SERIES) });
    expect(patches[2].body).toMatchObject({
      location: "https://meet.example.edu/m1",
      description: describe_("https://meet.example.edu/m1")
    });
  });
});

describe("only upcoming dates change", () => {
  const OLD_SERIES = "https://portal.example.edu/meet/producers";
  const NEW_SERIES = "https://meet.example.edu/producers";
  const describe_ = (url: string) => `${url}\n\nEncrypted InFocus meeting. Sign in with your InFocus account.`;
  // Saturday Oct 10, noon Pacific: Sun Oct 4, Mon Oct 5 and Wed Oct 7 have happened.
  const LATER = new Date("2026-10-10T19:00:00.000Z");
  const oldSeries = (overrides: Record<string, unknown> = {}) => ({
    id: "series-1",
    summary: "InFocus Producer Meeting",
    location: OLD_SERIES,
    description: describe_(OLD_SERIES),
    start: { dateTime: "2026-10-04T21:15:00-07:00" },
    recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=SU,MO,WE"],
    attendees: rows.map((row) => ({ email: row.email })),
    ...overrides
  });

  it("splits a series that has past dates: UNTIL on the old one, a new one from the next slot, exceptions re-applied", async () => {
    mocks.series.findUnique.mockResolvedValue({ googleEventId: "series-1" });
    // One upcoming slot was moved (Mon Oct 12 → 22:00).
    mocks.meeting.findMany.mockImplementation(async ({ where }: { where: { seriesKey?: unknown } }) =>
      where.seriesKey === "producers"
        ? [{ occurrenceKey: "2026-10-12", startsAt: new Date("2026-10-13T05:00:00.000Z"), durationMinutes: 60, status: "SCHEDULED" }]
        : []
    );
    mocks.meeting.findUnique.mockResolvedValue({ startsAt: new Date("2026-10-13T05:00:00.000Z"), durationMinutes: 60, status: "SCHEDULED" });
    google({
      "GET /series-1": () => json(oldSeries()),
      "PATCH /series-1": () => json({}),
      "POST /": () => json({ id: "series-2" }),
      "GET /series-2/instances": (call) =>
        call.url.searchParams.get("originalStart")
          ? json({ items: [{ id: "series-2_20261013T041500Z", start: { dateTime: "2026-10-12T21:15:00-07:00" }, end: { dateTime: "2026-10-12T22:15:00-07:00" } }] })
          : json({ items: [] }),
      "PATCH /series-2_20261013T041500Z": () => json({})
    });

    await runMeetingCalendarJob({ kind: "sync" }, LATER);

    const until = calls.find((call) => call.method === "PATCH" && call.url.pathname.endsWith("/series-1"))!;
    // Last slot before now: Wed Oct 7, 21:15 PDT = 04:15 UTC Oct 8. Nothing else on the old event changes.
    expect(until.body).toEqual({ recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=SU,MO,WE;UNTIL=20261008T041500Z"] });
    expect(until.url.searchParams.get("sendUpdates")).toBe("all");

    const created = calls.find((call) => call.method === "POST")!;
    expect(created.url.searchParams.get("sendUpdates")).toBe("all");
    expect(created.body).toMatchObject({
      location: NEW_SERIES,
      description: describe_(NEW_SERIES),
      start: { dateTime: "2026-10-11T21:15:00", timeZone: "America/Los_Angeles" },
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=SU,MO,WE"],
      attendees: rows.map((row) => ({ email: row.email }))
    });
    expect(mocks.series.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { googleEventId: "series-2" } }));

    // The moved slot is re-applied on the new event.
    const moved = calls.find((call) => call.method === "PATCH" && call.url.pathname.endsWith("/series-2_20261013T041500Z"))!;
    expect(moved.body).toMatchObject({ start: { dateTime: "2026-10-12T22:00:00" } });
  });

  it("PATCHes in place when the series hasn't had a date yet", async () => {
    mocks.series.findUnique.mockResolvedValue({ googleEventId: "series-1" });
    google({ "GET /series-1": () => json(oldSeries()), "PATCH /series-1": () => json({}) });
    await runMeetingCalendarJob({ kind: "sync" }, NOW); // Sat Oct 3: the first date (Sun Oct 4) is still ahead
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(calls.find((call) => call.method === "PATCH")!.body).toMatchObject({ location: NEW_SERIES });
  });

  it("a guest-only change PATCHes the whole series without splitting, even with past dates", async () => {
    mocks.series.findUnique.mockResolvedValue({ googleEventId: "series-1" });
    const current = oldSeries({ location: NEW_SERIES, description: describe_(NEW_SERIES), attendees: [{ email: "abby@example.edu" }] });
    google({ "GET /series-1": () => json(current), "PATCH /series-1": () => json({}) });
    await runMeetingCalendarJob({ kind: "sync" }, LATER);
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    const patch = calls.find((call) => call.method === "PATCH")!;
    expect(patch.body).not.toHaveProperty("recurrence");
    expect(patch.body?.attendees).toHaveLength(3);
  });

  it("never touches past instances, or an occurrence whose date has passed", async () => {
    mocks.series.findUnique.mockResolvedValue({ googleEventId: "series-1" });
    const current = oldSeries({ location: NEW_SERIES, description: describe_(NEW_SERIES) });
    google({
      "GET /series-1": () => json(current),
      "GET /series-1/instances": () =>
        json({
          items: [
            // Started an hour ago (Google's timeMin still returns it): left alone.
            { id: "running", location: OLD_SERIES, description: describe_(OLD_SERIES), start: { dateTime: "2026-10-10T11:00:00-07:00" } }
          ]
        })
    });
    await runMeetingCalendarJob({ kind: "sync" }, LATER);
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);

    calls.length = 0;
    mocks.meeting.findUnique.mockResolvedValue({ startsAt: new Date("2026-10-08T05:00:00.000Z"), durationMinutes: 60, status: "CANCELED" });
    await runMeetingCalendarJob({ kind: "occurrence", occurrenceKey: "2026-10-07" }, LATER);
    expect(calls.some((call) => call.url.pathname.endsWith("/instances"))).toBe(false);
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("never edits or deletes a one-off meeting that has ended", async () => {
    for (const status of ["SCHEDULED", "CANCELED"]) {
      calls.length = 0;
      mocks.meeting.findUnique.mockResolvedValue({
        id: "m1",
        title: "Renamed later",
        startsAt: new Date("2026-10-09T01:30:00.000Z"),
        durationMinutes: 45,
        status,
        access: "OPEN",
        createdById: "u-sage",
        inviteeUserIds: [],
        seriesKey: null,
        calendarSequence: 1,
        googleEventId: "evt-old"
      });
      google({});
      await runMeetingCalendarJob({ kind: "event", meetingId: "m1" }, LATER);
      expect(calls).toEqual([]);
      expect(mocks.meeting.update).not.toHaveBeenCalled();
    }
  });
});

describe("series occurrence", () => {
  beforeEach(() => {
    mocks.series.findUnique.mockResolvedValue({ googleEventId: "series-1" });
  });

  function seriesUnchanged() {
    return json({
      id: "series-1",
      summary: "InFocus Producer Meeting",
      location: "https://meet.example.edu/producers",
      description: "https://meet.example.edu/producers\n\nEncrypted InFocus meeting. Sign in with your InFocus account.",
      attendees: rows.map((row) => ({ email: row.email }))
    });
  }

  it("moves the instance found by its original start", async () => {
    mocks.meeting.findUnique.mockResolvedValue({ startsAt: new Date("2026-11-02T06:00:00.000Z"), durationMinutes: 60, status: "SCHEDULED" });
    google({
      "GET /series-1": seriesUnchanged,
      "GET /series-1/instances": () =>
        json({ items: [{ id: "series-1_20261102T051500Z", start: { dateTime: "2026-11-01T21:15:00-08:00" }, end: { dateTime: "2026-11-01T22:15:00-08:00" } }] }),
      "PATCH /series-1_20261102T051500Z": () => json({})
    });
    await runMeetingCalendarJob({ kind: "occurrence", occurrenceKey: "2026-11-01" }, NOW);
    const lookup = calls.find((call) => call.url.pathname.endsWith("/instances"))!;
    expect(lookup.url.searchParams.get("originalStart")).toBe("2026-11-02T05:15:00Z");
    const patch = calls.find((call) => call.method === "PATCH")!;
    expect(patch.url.searchParams.get("sendUpdates")).toBe("all");
    expect(patch.body).toEqual({
      start: { dateTime: "2026-11-01T22:00:00", timeZone: "America/Los_Angeles" },
      end: { dateTime: "2026-11-01T23:00:00", timeZone: "America/Los_Angeles" }
    });
  });

  it("cancels the instance", async () => {
    mocks.meeting.findUnique.mockResolvedValue({ startsAt: new Date("2026-11-02T05:15:00.000Z"), durationMinutes: 60, status: "CANCELED" });
    google({
      "GET /series-1": seriesUnchanged,
      "GET /series-1/instances": () => json({ items: [{ id: "inst-1", status: "confirmed" }] }),
      "PATCH /inst-1": () => json({})
    });
    await runMeetingCalendarJob({ kind: "cancel", occurrenceKey: "2026-11-01", durationMinutes: 60 }, NOW); // legacy payload
    expect(calls.find((call) => call.method === "PATCH")!.body).toEqual({ status: "cancelled" });
  });
});

describe("one-off meetings", () => {
  const oneOff = {
    id: "m1",
    title: "Budget review",
    startsAt: new Date("2026-10-10T01:30:00.000Z"),
    durationMinutes: 45,
    status: "SCHEDULED",
    access: "OPEN",
    createdById: "u-sage",
    inviteeUserIds: [] as string[],
    seriesKey: null,
    calendarSequence: 1,
    googleEventId: null as string | null
  };

  it("creates a single event with /meet/<id> and stores its id", async () => {
    mocks.meeting.findUnique.mockResolvedValue(oneOff);
    google({ "POST /": () => json({ id: "evt-1" }) });
    await runMeetingCalendarJob({ kind: "event", meetingId: "m1" }, NOW);
    expect(calls[0].body).toMatchObject({
      summary: "Budget review",
      location: "https://meet.example.edu/m1",
      start: { dateTime: "2026-10-09T18:30:00", timeZone: "America/Los_Angeles" },
      end: { dateTime: "2026-10-09T19:15:00", timeZone: "America/Los_Angeles" },
      attendees: [{ email: "abby@example.edu" }, { email: "guest@example.edu" }, { email: "otto@example.edu" }]
    });
    expect(calls[0].body).not.toHaveProperty("recurrence");
    expect(mocks.meeting.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { googleEventId: "evt-1" } });
  });

  it("PATCHes a moved or renamed meeting", async () => {
    mocks.meeting.findUnique.mockResolvedValue({ ...oneOff, title: "Budget review (moved)", googleEventId: "evt-1" });
    google({
      "GET /evt-1": () =>
        json({
          id: "evt-1",
          summary: "Budget review",
          start: { dateTime: "2026-10-09T17:00:00-07:00" },
          end: { dateTime: "2026-10-09T17:45:00-07:00" },
          attendees: rows.map((row) => ({ email: row.email }))
        }),
      "PATCH /evt-1": () => json({})
    });
    await runMeetingCalendarJob({ kind: "event", meetingId: "m1" }, NOW);
    const patch = calls.find((call) => call.method === "PATCH")!;
    expect(patch.url.searchParams.get("sendUpdates")).toBe("all");
    expect(patch.body).toMatchObject({ summary: "Budget review (moved)", start: { dateTime: "2026-10-09T18:30:00" } });
  });

  it("DELETEs a cancelled meeting's event (guests get Google's cancellation)", async () => {
    mocks.meeting.findUnique.mockResolvedValue({ ...oneOff, status: "CANCELED", googleEventId: "evt-1" });
    google({ "DELETE /evt-1": () => new Response(null, { status: 204 }) });
    await runMeetingCalendarJob({ kind: "event", meetingId: "m1" }, NOW);
    expect(calls[0].url.searchParams.get("sendUpdates")).toBe("all");
    expect(mocks.meeting.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { googleEventId: null } });
  });

  it("INVITE_ONLY: only addresses linked to the creator or an invitee are guests", async () => {
    mocks.meeting.findUnique.mockResolvedValue({ ...oneOff, access: "INVITE_ONLY", inviteeUserIds: ["u-otto"] });
    google({ "POST /": () => json({ id: "evt-2" }) });
    await runMeetingCalendarJob({ kind: "event", meetingId: "m1" }, NOW);
    expect(calls[0].body?.attendees).toEqual([{ email: "otto@example.edu" }]);
  });

  it("skips Start-now meetings (no event)", async () => {
    mocks.meeting.findUnique.mockResolvedValue({ ...oneOff, calendarSequence: 0 });
    google({});
    await runMeetingCalendarJob({ kind: "event", meetingId: "m1" }, NOW);
    expect(calls).toEqual([]);
  });
});

describe("calendarAttendees", () => {
  it("EXECS_ONLY: only addresses linked to an exec; unlinked addresses never", () => {
    expect(calendarAttendees(rows, { access: "EXECS_ONLY", createdById: "u-otto", inviteeUserIds: [] }, ["u-otto"])).toEqual([
      "otto@example.edu"
    ]);
    expect(calendarAttendees(rows, { access: "EXECS_ONLY", createdById: "u-otto", inviteeUserIds: [] }, [])).toEqual([]);
  });

  it("OPEN and the series: every address; INVITE_ONLY: linked creator and invitees only", () => {
    expect(calendarAttendees(rows, null)).toEqual(["abby@example.edu", "guest@example.edu", "otto@example.edu"]);
    expect(calendarAttendees(rows, { access: "INVITE_ONLY", createdById: "u-abby", inviteeUserIds: ["u-otto"] })).toEqual([
      "abby@example.edu",
      "otto@example.edu"
    ]);
  });
});

describe("not connected, and failures", () => {
  it("does nothing at all when Google Calendar isn't connected", async () => {
    mocks.credential.findUnique.mockResolvedValue(null);
    await expect(runMeetingCalendarJob({ kind: "sync" }, NOW)).resolves.toEqual({ skipped: "not-connected" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.series.upsert).not.toHaveBeenCalled();
  });

  it("records a short reason for the panel and rethrows so Inngest retries", async () => {
    mocks.series.findUnique.mockResolvedValue(null);
    google({ "POST /": () => json({ error: { message: "Calendar API has not been used in project 123" } }, 403) });
    await expect(runMeetingCalendarJob({ kind: "sync" }, NOW)).rejects.toThrow(/HTTP 403/);
    expect(mocks.series.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: { lastSyncError: "Google Calendar refused (HTTP 403): Calendar API has not been used in project 123" }
      })
    );
  });
});

describe("OAuth: one redirect, two purposes", () => {
  it("YouTube and Calendar states never verify for each other", () => {
    const youtube = createConnectState("u-admin", SECRET, NOW.getTime());
    const calendar = createConnectState("u-admin", SECRET, NOW.getTime(), "calendar");
    const base = { userId: "u-admin", secret: SECRET, now: NOW.getTime() };
    expect(verifyConnectState(youtube.state, { ...base, cookieNonce: youtube.nonce })).toBe(true);
    expect(verifyConnectState(youtube.state, { ...base, cookieNonce: youtube.nonce, purpose: "calendar" })).toBe(false);
    expect(verifyConnectState(calendar.state, { ...base, cookieNonce: calendar.nonce, purpose: "calendar" })).toBe(true);
    expect(verifyConnectState(calendar.state, { ...base, cookieNonce: calendar.nonce })).toBe(false);
  });

  it("Connect Google Calendar asks only for calendar.events + email, via the YouTube callback", async () => {
    const response = await calendarConnect();
    const target = new URL(response.headers.get("location")!);
    expect(target.searchParams.get("redirect_uri")).toBe("https://portal.example.edu/api/admin/youtube/callback");
    expect(target.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar.events openid email");
    expect(target.searchParams.get("access_type")).toBe("offline");
    expect(target.searchParams.get("prompt")).toBe("consent");
    expect(target.searchParams.get("include_granted_scopes")).toBeNull();
    expect(response.headers.get("set-cookie")).toContain(`${GOOGLE_CALENDAR_CONNECT_COOKIE}=`);
  });

  it("the callback saves a Calendar credential for a calendar state and leaves YouTube alone", async () => {
    const { state, nonce } = createConnectState("u-admin", SECRET, Date.now(), "calendar");
    mocks.cookies[GOOGLE_CALENDAR_CONNECT_COOKIE] = nonce;
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return json({ access_token: "a", refresh_token: "r", scope: "https://www.googleapis.com/auth/calendar.events openid email" });
      }
      if (url.startsWith("https://openidconnect.googleapis.com/v1/userinfo")) return json({ email: "InFocus@example.edu" });
      throw new Error(`unexpected ${url}`);
    });
    const response = await callback(new Request(`https://portal.example.edu/api/admin/youtube/callback?state=${state}&code=c1`));
    expect(response.headers.get("location")).toBe("https://portal.example.edu/admin?gcal=connected");
    expect(mocks.credential.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ accountEmail: "infocus@example.edu" }) })
    );
    expect(mocks.youtubeCredential.upsert).not.toHaveBeenCalled();
  });

  it("a YouTube state still runs the YouTube flow exactly as before", async () => {
    const { state, nonce } = createConnectState("u-admin", SECRET, Date.now());
    mocks.cookies[YOUTUBE_CONNECT_COOKIE] = nonce;
    mocks.cookies[GOOGLE_CALENDAR_CONNECT_COOKIE] = nonce; // even a stray calendar cookie can't hijack it
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return json({ access_token: "a", refresh_token: "r", scope: YOUTUBE_SCOPES.join(" ") });
      }
      if (url.includes("/youtube/v3/channels")) return json({ items: [{ id: "UCinfocus", snippet: { title: "InFocus" } }] });
      throw new Error(`unexpected ${url}`);
    });
    const response = await callback(new Request(`https://portal.example.edu/api/admin/youtube/callback?state=${state}&code=c1`));
    expect(response.headers.get("location")).toBe("https://portal.example.edu/admin?youtube=connected");
    expect(mocks.youtubeCredential.upsert).toHaveBeenCalled();
    expect(mocks.credential.upsert).not.toHaveBeenCalled();
  });
});
