import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  meeting: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  invite: { findMany: vi.fn(), updateMany: vi.fn() },
  seriesUpsert: vi.fn(),
  roleFindMany: vi.fn(),
  userFindMany: vi.fn(),
  webPush: vi.fn(),
  nativePush: vi.fn(),
  calendarEmail: vi.fn(),
  inngestSend: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    meeting: mocks.meeting,
    meetingInviteEmail: mocks.invite,
    meetingSeriesCalendar: { upsert: mocks.seriesUpsert },
    platformRoleAssignment: { findMany: mocks.roleFindMany },
    user: { findMany: mocks.userFindMany }
  }
}));
vi.mock("@/src/server/push-notify", () => ({ sendPushToUserIds: mocks.webPush }));
vi.mock("@/src/lib/native-push", () => ({ sendNativePushToUserIds: mocks.nativePush }));
vi.mock("@/src/lib/email", () => ({ sendCalendarEmail: mocks.calendarEmail }));
vi.mock("@/src/lib/inngest", () => ({ inngest: { send: mocks.inngestSend } }));

import { buildEventCancel, buildEventInvite } from "@/src/lib/meetings/ics";
import { calendarChanges } from "@/src/server/meetings-edit";
import { eventInviteRecipients, meetingEventUid, runMeetingInvitesJob } from "@/src/server/meetings-invite-mail";
import { runMeetingReminders } from "@/src/server/meetings-notify";

const NOW = new Date("2026-10-05T04:00:00.000Z");
const MIN = 60_000;

function meeting(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    title: "InFocus Producer Meeting",
    startsAt: new Date(NOW.getTime() + 15 * MIN),
    createdAt: new Date(NOW.getTime() - 24 * 60 * MIN),
    access: "OPEN",
    createdById: null,
    inviteeUserIds: [] as string[],
    ...overrides
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_BASE_URL", "https://portal.example.edu");
  vi.stubEnv("RESEND_FROM_EMAIL", "portal@example.edu");
  mocks.meeting.findMany.mockResolvedValue([]);
  mocks.meeting.updateMany.mockResolvedValue({ count: 1 });
  mocks.roleFindMany.mockResolvedValue([{ email: "abby@example.edu" }, { email: "otto@example.edu" }]);
  mocks.userFindMany.mockResolvedValue([
    { id: "u-abby", name: "Abby", nickname: null, email: "abby@example.edu" },
    { id: "u-otto", name: "Otto", nickname: null, email: "otto@example.edu" }
  ]);
  mocks.webPush.mockResolvedValue({ sent: 1, failed: 0 });
  mocks.nativePush.mockResolvedValue({ sent: 1, failed: 0 });
  mocks.calendarEmail.mockResolvedValue(true);
  mocks.invite.updateMany.mockResolvedValue({ count: 1 });
  mocks.seriesUpsert.mockResolvedValue({ sequence: 9 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runMeetingReminders", () => {
  it("claims the 15-minute reminder and pushes producers with an absolute /meet/<id> link", async () => {
    mocks.meeting.findMany.mockResolvedValueOnce([meeting()]).mockResolvedValueOnce([]);
    await expect(runMeetingReminders(NOW)).resolves.toEqual({ pushed: 1 });

    const query15 = mocks.meeting.findMany.mock.calls[0][0];
    expect(query15.where.reminder15SentAt).toBeNull();
    expect(query15.where.startsAt).toEqual({ gt: new Date(NOW.getTime() + 13 * MIN), lte: new Date(NOW.getTime() + 15 * MIN) });
    expect(mocks.meeting.updateMany).toHaveBeenCalledWith({ where: { id: "m1", reminder15SentAt: null }, data: { reminder15SentAt: NOW } });
    const payload = { title: "InFocus Producer Meeting starts in 15 minutes", body: "Tap to open the meeting.", url: "https://portal.example.edu/meet/m1" };
    expect(mocks.webPush).toHaveBeenCalledWith(["u-abby", "u-otto"], payload, "browser");
    expect(mocks.nativePush).toHaveBeenCalledWith(["u-abby", "u-otto"], payload);
  });

  it("sends the 5-minute reminder with 'Join now.'", async () => {
    const soon = meeting({ startsAt: new Date(NOW.getTime() + 5 * MIN) });
    mocks.meeting.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([soon]);
    await runMeetingReminders(NOW);
    expect(mocks.meeting.updateMany).toHaveBeenCalledWith({ where: { id: "m1", reminder5SentAt: null }, data: { reminder5SentAt: NOW } });
    expect(mocks.nativePush.mock.calls[0][1]).toMatchObject({ title: "InFocus Producer Meeting starts in 5 minutes", body: "Join now." });
  });

  it("never pushes twice when another run already claimed it", async () => {
    mocks.meeting.findMany.mockResolvedValueOnce([meeting()]).mockResolvedValueOnce([]);
    mocks.meeting.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(runMeetingReminders(NOW)).resolves.toEqual({ pushed: 0 });
    expect(mocks.webPush).not.toHaveBeenCalled();
  });

  it("skips a meeting created after the reminder time had passed", async () => {
    // Starts in 14 minutes, so its 15-minute mark was a minute ago; created 30 seconds ago.
    const late = meeting({ startsAt: new Date(NOW.getTime() + 14 * MIN), createdAt: new Date(NOW.getTime() - 30_000) });
    mocks.meeting.findMany.mockResolvedValueOnce([late]).mockResolvedValueOnce([]);
    await runMeetingReminders(NOW);
    expect(mocks.meeting.updateMany).not.toHaveBeenCalled();
  });

  it("INVITE_ONLY reminds only the creator and invitees; OPEN with invitees reminds them only", async () => {
    mocks.meeting.findMany
      .mockResolvedValueOnce([
        meeting({ id: "secret", access: "INVITE_ONLY", createdById: "u-sage", inviteeUserIds: ["u-otto"] }),
        meeting({ id: "open-picked", inviteeUserIds: ["u-abby"] })
      ])
      .mockResolvedValueOnce([]);
    await runMeetingReminders(NOW);
    expect(mocks.nativePush.mock.calls.map((call) => call[0])).toEqual([["u-sage", "u-otto"], ["u-abby"]]);
  });
});

describe("one-off meeting ICS", () => {
  const base = {
    uid: "meeting-m1@portal.example.edu",
    sequence: 2,
    title: "Budget review",
    url: "https://portal.example.edu/meet/m1",
    organizer: { email: "portal@example.edu", name: "InFocus Portal" },
    attendee: { email: "abby@example.edu", name: "Abby" },
    now: NOW,
    start: new Date("2026-10-10T01:30:00.000Z"),
    durationMinutes: 45
  };

  it("REQUEST: single event, its own UID and SEQUENCE, no RRULE", () => {
    const ics = buildEventInvite(base).replace(/\r\n /g, "");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("UID:meeting-m1@portal.example.edu");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("DTSTART;TZID=America/Los_Angeles:20261009T183000");
    expect(ics).toContain("DURATION:PT45M");
    expect(ics).toContain("URL:https://portal.example.edu/meet/m1");
    expect(ics).not.toContain("RRULE:FREQ=WEEKLY");
    expect(ics).not.toContain("RECURRENCE-ID");
  });

  it("CANCEL: STATUS:CANCELLED", () => {
    const ics = buildEventCancel(base).replace(/\r\n /g, "");
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("UID:meeting-m1@portal.example.edu");
  });

  it("builds the UID from the Portal host", () => {
    expect(meetingEventUid("m1")).toBe("meeting-m1@portal.example.edu");
  });
});

describe("eventInviteRecipients", () => {
  const rows = [
    { id: "a", userId: "u-abby" },
    { id: "o", userId: "u-otto" },
    { id: "s", userId: "u-sage" },
    { id: "x", userId: null }
  ];

  it("OPEN: every address on the list", () => {
    expect(eventInviteRecipients(rows, { access: "OPEN", createdById: "u-sage", inviteeUserIds: [] }).map((r) => r.id)).toEqual([
      "a",
      "o",
      "s",
      "x"
    ]);
  });

  it("INVITE_ONLY: only addresses linked to the creator or an invitee", () => {
    const secret = { access: "INVITE_ONLY" as const, createdById: "u-sage", inviteeUserIds: ["u-otto"] };
    expect(eventInviteRecipients(rows, secret).map((r) => r.id)).toEqual(["o", "s"]);
    expect(eventInviteRecipients(rows, secret, ["u-abby"]).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("calendarChanges (one-off meetings)", () => {
  const sent = { seriesKey: null, calendarSequence: 1, access: "INVITE_ONLY" as const };

  it("does nothing for the series or meetings that never sent invites", () => {
    expect(calendarChanges({ ...sent, seriesKey: "producers" }, { status: "CANCELED" }, false, [], [])).toEqual([]);
    expect(calendarChanges({ ...sent, calendarSequence: 0 }, { status: "CANCELED" }, false, [], [])).toEqual([]);
  });

  it("cancel → CANCEL to everyone; move → REQUEST to everyone", () => {
    expect(calendarChanges(sent, { status: "CANCELED" }, false, [], [])).toEqual([{ method: "CANCEL" }]);
    expect(calendarChanges(sent, { startsAt: NOW }, true, [], [])).toEqual([{ method: "REQUEST" }]);
  });

  it("INVITE_ONLY list changes → REQUEST to added, CANCEL to dropped", () => {
    expect(calendarChanges(sent, { inviteeUserIds: ["u-abby"] }, false, ["u-abby"], ["u-otto"])).toEqual([
      { method: "REQUEST", onlyUserIds: ["u-abby"] },
      { method: "CANCEL", onlyUserIds: ["u-otto"], uninvited: true }
    ]);
  });

  it("OPEN list changes send nothing (every address already has it)", () => {
    expect(calendarChanges({ ...sent, access: "OPEN" }, { inviteeUserIds: ["u-abby"] }, false, ["u-abby"], [])).toEqual([]);
  });
});

describe("runMeetingInvitesJob event", () => {
  const list = [
    { id: "i-abby", email: "abby@example.edu", name: "Abby", userId: "u-abby", createdAt: NOW, lastInvitedAt: null },
    { id: "i-guest", email: "guest@example.edu", name: null, userId: null, createdAt: NOW, lastInvitedAt: null }
  ];
  const oneOff = {
    id: "m1",
    title: "Budget review",
    startsAt: new Date("2026-10-10T01:30:00.000Z"),
    durationMinutes: 60,
    status: "SCHEDULED",
    access: "INVITE_ONLY",
    createdById: "u-sage",
    inviteeUserIds: ["u-abby"],
    seriesKey: null
  };

  it("INVITE_ONLY REQUEST goes only to linked invitees, with the job's SEQUENCE", async () => {
    mocks.invite.findMany.mockResolvedValue(list);
    mocks.meeting.findUnique.mockResolvedValue(oneOff);
    await expect(runMeetingInvitesJob({ kind: "event", meetingId: "m1", method: "REQUEST", sequence: 3 }, NOW)).resolves.toEqual({
      sent: 1,
      failed: 0
    });
    const mail = mocks.calendarEmail.mock.calls[0][0];
    expect(mail.to).toBe("abby@example.edu");
    expect(mail.method).toBe("REQUEST");
    expect(mail.ics).toContain("SEQUENCE:3");
    expect(mail.ics).toContain("SUMMARY:Budget review");
    expect(mail.ctaUrl).toBe("https://portal.example.edu/meet/m1");
    expect(mail.subject).toMatch(/^Updated: Budget review/);
  });

  it("skips a stale REQUEST once the meeting is cancelled; CANCEL still goes out", async () => {
    mocks.invite.findMany.mockResolvedValue(list);
    mocks.meeting.findUnique.mockResolvedValue({ ...oneOff, status: "CANCELED", access: "OPEN" });
    await expect(runMeetingInvitesJob({ kind: "event", meetingId: "m1", method: "REQUEST", sequence: 2 }, NOW)).resolves.toEqual({
      sent: 0,
      failed: 0
    });
    await runMeetingInvitesJob({ kind: "event", meetingId: "m1", method: "CANCEL", sequence: 2 }, NOW);
    expect(mocks.calendarEmail.mock.calls.map((call) => call[0].to)).toEqual(["abby@example.edu", "guest@example.edu"]);
    expect(mocks.calendarEmail.mock.calls[0][0].ics).toContain("METHOD:CANCEL");
  });

  it("series invites use the new title in SUMMARY and the subject", async () => {
    mocks.invite.findMany.mockResolvedValue([list[0]]);
    await runMeetingInvitesJob({ kind: "series" }, NOW);
    const mail = mocks.calendarEmail.mock.calls[0][0];
    expect(mail.ics).toContain("SUMMARY:InFocus Producer Meeting");
    expect(mail.subject).toContain("InFocus Producer Meeting");
    expect(mail.ctaUrl).toBe("https://portal.example.edu/meet/producers");
  });
});
