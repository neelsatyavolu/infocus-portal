import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  viewer: { id: "u-abby", email: "abby@example.edu", role: "ASSOCIATE_PRODUCER" as string | null },
  meeting: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  participant: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
  userFindMany: vi.fn(),
  roleFindMany: vi.fn(),
  invite: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateMany: vi.fn()
  },
  inngestSend: vi.fn(),
  seriesUpsert: vi.fn(),
  seriesFindUnique: vi.fn(),
  roomEvent: vi.fn(),
  rotateKey: vi.fn(),
  scribeRekey: vi.fn(),
  fetchTranscript: vi.fn(),
  calendarStatus: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => mocks.viewer.id),
  syncUserProfile: vi.fn(async () => ({ id: mocks.viewer.id, email: mocks.viewer.email, name: "Viewer", nickname: null }))
}));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/platform-admin")>()),
  getPlatformAccess: vi.fn(async () => ({ role: mocks.viewer.role }))
}));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    meeting: mocks.meeting,
    meetingParticipant: mocks.participant,
    user: { findMany: mocks.userFindMany },
    platformRoleAssignment: { findMany: mocks.roleFindMany },
    meetingInviteEmail: mocks.invite,
    meetingSeriesCalendar: { upsert: mocks.seriesUpsert, findUnique: mocks.seriesFindUnique }
  }
}));
vi.mock("@/src/server/meetings-room-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/server/meetings-room-client")>()),
  sendMeetingRoomEvent: mocks.roomEvent
}));
vi.mock("@/src/server/meetings-keys", () => ({
  ensureMeetingKey: vi.fn(async () => ({ key: "k", epoch: 0 })),
  rotateMeetingKey: mocks.rotateKey,
  readMeetingKey: vi.fn(() => ({ key: "k", epoch: 0 }))
}));
vi.mock("@/src/server/meetings-scribe", () => ({
  startMeetingScribe: vi.fn(),
  stopMeetingScribe: vi.fn(),
  rekeyMeetingScribe: mocks.scribeRekey,
  fetchMeetingTranscript: mocks.fetchTranscript
}));
vi.mock("@/src/server/meetings-usage", () => ({ checkMeetingUsage: vi.fn(async () => "allowed"), MEETING_USAGE_LIMIT_MESSAGE: "over" }));
vi.mock("@/src/server/google-calendar-credential", () => ({
  googleCalendarConnection: mocks.calendarStatus,
  googleCalendarAccessToken: vi.fn(),
  GoogleCalendarError: class extends Error {}
}));
vi.mock("@/src/lib/inngest", () => ({ inngest: { send: mocks.inngestSend } }));

import { POST as createPost } from "@/app/api/meetings/route";
import { GET as detailGet, PATCH as detailPatch } from "@/app/api/meetings/[id]/route";
import { POST as joinPost } from "@/app/api/meetings/[id]/join/route";
import { GET as keyGet } from "@/app/api/meetings/[id]/key/route";
import { GET as transcriptGet } from "@/app/api/meetings/[id]/transcript/route";
import { GET as peopleGet } from "@/app/api/meetings/people/route";
import { GET as seriesGet } from "@/app/api/meetings/series/producers/current/route";
import { GET as invitesGet, POST as invitesPost } from "@/app/api/meetings/invites/route";
import { DELETE as inviteDelete, PATCH as invitePatch } from "@/app/api/meetings/invites/[id]/route";
import { POST as sendAllPost } from "@/app/api/meetings/invites/send-all/route";
import { resolveProducerSeriesMeetingId } from "@/src/server/meetings-schedule";
import { MEETING_CALENDAR_EVENT } from "@/src/server/meetings-google-calendar";
import { visibleMeetingWhere } from "@/src/server/meetings-access";

const producers = [
  { id: "u-abby", name: "Abby", nickname: null, email: "abby@example.edu" },
  { id: "u-otto", name: "Otto", nickname: "O.", email: "otto@example.edu" },
  { id: "u-sage", name: "Sage", nickname: null, email: "sage@example.edu" }
];

function as(id: string, role: string | null) {
  mocks.viewer.id = id;
  mocks.viewer.email = `${id}@example.edu`;
  mocks.viewer.role = role;
}

function json(method: string, body?: unknown) {
  return new Request("https://portal.example.edu/api/meetings", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

const params = { params: Promise.resolve({ id: "m1" }) };

const inviteOnly = {
  id: "m1",
  title: "Exec sync",
  startsAt: new Date("2026-10-05T04:15:00.000Z"),
  durationMinutes: 60,
  status: "LIVE",
  access: "INVITE_ONLY",
  createdById: "u-sage",
  inviteeUserIds: ["u-abby", "u-otto"],
  seriesKey: null,
  occurrenceKey: null,
  quickAccess: false,
  notesEnabled: true,
  notesStatus: "READY",
  notesSummary: "secret summary",
  notesDrivePath: "Meetings/x",
  notesDrivePaths: ["Meetings/x"],
  startedAt: null,
  endedAt: null,
  keyCiphertext: "sealed",
  keyEpoch: 0,
  createdBy: null,
  _count: { participants: 0 }
};

beforeEach(() => {
  vi.clearAllMocks();
  // Drop queued *Once values on the shared mocks (defaults are set again below).
  for (const value of Object.values(mocks)) {
    for (const fn of typeof value === "function" ? [value] : Object.values(value)) {
      if (vi.isMockFunction(fn)) fn.mockReset();
    }
  }
  vi.stubEnv("MEETING_ROOM_SECRET", "s".repeat(40));
  vi.stubEnv("MEETING_ROOM_URL", "https://meet.example.edu");
  vi.stubEnv("RESEND_FROM_EMAIL", "portal@example.edu");
  vi.stubEnv("APP_BASE_URL", "https://portal.example.edu");
  as("u-abby", "ASSOCIATE_PRODUCER");
  mocks.roleFindMany.mockResolvedValue(producers.map((user) => ({ email: user.email })));
  mocks.userFindMany.mockImplementation(async ({ where }: { where: { id?: { in: string[] } } }) =>
    where.id ? producers.filter((user) => where.id!.in.includes(user.id)) : producers
  );
  mocks.meeting.findUnique.mockResolvedValue(inviteOnly);
  mocks.meeting.findUniqueOrThrow.mockResolvedValue(inviteOnly);
  mocks.meeting.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...inviteOnly, ...data }));
  mocks.meeting.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...inviteOnly,
    ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
  }));
  mocks.meeting.findMany.mockResolvedValue([]);
  mocks.meeting.createMany.mockResolvedValue({ count: 0 });
  mocks.meeting.updateMany.mockResolvedValue({ count: 0 });
  mocks.participant.findUnique.mockResolvedValue({ state: "ADMITTED" });
  mocks.participant.findMany.mockResolvedValue([]);
  mocks.participant.updateMany.mockResolvedValue({ count: 1 });
  mocks.participant.upsert.mockResolvedValue({});
  mocks.rotateKey.mockResolvedValue({ key: "new", epoch: 1 });
  mocks.roomEvent.mockResolvedValue(true);
  mocks.fetchTranscript.mockResolvedValue("# transcript");
  mocks.calendarStatus.mockResolvedValue({ accountEmail: "infocus@example.edu", connectedAt: new Date() });
  mocks.seriesFindUnique.mockResolvedValue({ lastSyncedAt: null, lastSyncError: "Google Calendar refused (HTTP 403)" });
  mocks.seriesUpsert.mockResolvedValue({ sequence: 3 });
  mocks.invite.findMany.mockResolvedValue([]);
  mocks.invite.updateMany.mockResolvedValue({ count: 1 });
  mocks.invite.findUnique.mockResolvedValue(null);
  mocks.inngestSend.mockResolvedValue({ ids: ["e1"] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/meetings access", () => {
  it("refuses INVITE_ONLY from a non-exec", async () => {
    const response = await createPost(json("POST", { title: "Private", access: "INVITE_ONLY", inviteeUserIds: ["u-otto"] }));
    expect(response.status).toBe(403);
    expect(mocks.meeting.create).not.toHaveBeenCalled();
  });

  it("needs at least one producer invitee, and only producers", async () => {
    as("u-sage", "EXECUTIVE_PRODUCER");
    expect((await createPost(json("POST", { title: "Private", access: "INVITE_ONLY", inviteeUserIds: ["u-sage"] }))).status).toBe(400);
    expect((await createPost(json("POST", { title: "Private", access: "INVITE_ONLY", inviteeUserIds: ["u-stranger"] }))).status).toBe(400);
    const ok = await createPost(json("POST", { title: "Private", access: "INVITE_ONLY", inviteeUserIds: ["u-otto", "u-sage"] }));
    expect(ok.status).toBe(201);
    expect(mocks.meeting.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ access: "INVITE_ONLY", inviteeUserIds: ["u-otto"], createdById: "u-sage" }) })
    );
    expect((await ok.json()).data.meeting).toMatchObject({ access: "INVITE_ONLY", inviteeCount: 1 });
  });

  it("queues a Google Calendar event for a meeting scheduled ahead, not for Start now", async () => {
    const ahead = new Date(Date.now() + 2 * 3600_000).toISOString();
    expect((await createPost(json("POST", { title: "Planning", startsAt: ahead }))).status).toBe(201);
    expect(mocks.meeting.create.mock.calls[0][0].data.calendarSequence).toBe(1);
    expect(mocks.inngestSend).toHaveBeenCalledWith({
      name: MEETING_CALENDAR_EVENT,
      data: { kind: "event", meetingId: "m1" }
    });

    mocks.inngestSend.mockClear();
    expect((await createPost(json("POST", { title: "Quick sync" }))).status).toBe(201);
    expect(mocks.meeting.create.mock.calls[1][0].data.calendarSequence).toBe(0);
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("EXECS_ONLY: only execs create it, and it keeps no invitee list", async () => {
    expect((await createPost(json("POST", { title: "Exec sync", access: "EXECS_ONLY" }))).status).toBe(403);
    as("u-sage", "ADVISER");
    const response = await createPost(json("POST", { title: "Exec sync", access: "EXECS_ONLY", inviteeUserIds: ["u-abby"] }));
    expect(response.status).toBe(201);
    expect(mocks.meeting.create.mock.calls[0][0].data).toMatchObject({ access: "EXECS_ONLY", inviteeUserIds: [] });
  });

  it("lets any producer create an OPEN meeting", async () => {
    expect((await createPost(json("POST", { title: "Quick sync" }))).status).toBe(201);
  });
});

describe("INVITE_ONLY visibility", () => {
  it("404s outsiders, including uninvited execs, on detail, join, key and transcript", async () => {
    for (const [id, role] of [["u-stranger", "ASSOCIATE_PRODUCER"], ["u-exec", "SUPER_ADMIN"]] as const) {
      as(id, role);
      expect((await detailGet(json("GET"), params)).status).toBe(404);
      expect((await joinPost(json("POST"), params)).status).toBe(404);
      expect((await keyGet(json("GET"), params)).status).toBe(404);
      expect((await transcriptGet(json("GET"), params)).status).toBe(404);
    }
    expect(mocks.participant.upsert).not.toHaveBeenCalled();
    expect(mocks.fetchTranscript).not.toHaveBeenCalled();
  });

  it("EXECS_ONLY: 404 for a producer everywhere, visible to every exec", async () => {
    mocks.meeting.findUnique.mockResolvedValue({ ...inviteOnly, access: "EXECS_ONLY", inviteeUserIds: [] });
    expect((await detailGet(json("GET"), params)).status).toBe(404);
    expect((await joinPost(json("POST"), params)).status).toBe(404);
    expect((await keyGet(json("GET"), params)).status).toBe(404);
    expect((await transcriptGet(json("GET"), params)).status).toBe(404);
    expect((await detailPatch(json("PATCH", { title: "x" }), params)).status).toBe(404);

    as("u-exec", "EXECUTIVE_PRODUCER");
    const detail = await detailGet(json("GET"), params);
    expect(detail.status).toBe(200);
    expect((await detail.json()).data.meeting).toMatchObject({ access: "EXECS_ONLY", isHost: true });
    // Access is fixed at creation and the list is "every exec".
    expect((await detailPatch(json("PATCH", { inviteeUserIds: ["u-abby"] }), params)).status).toBe(400);
  });

  it("serves invitees the detail (with invitees) and the transcript", async () => {
    const detail = await detailGet(json("GET"), params);
    expect(detail.status).toBe(200);
    const body = (await detail.json()).data.meeting;
    expect(body).toMatchObject({ access: "INVITE_ONLY", notesSummary: "secret summary", isHost: false });
    expect(body.invitees.map((person: { id: string }) => person.id)).toEqual(["u-abby", "u-otto"]);
    expect((await transcriptGet(json("GET"), params)).status).toBe(200);
  });

  it("removing an invitee from a live meeting removes them and rekeys", async () => {
    as("u-sage", "EXECUTIVE_PRODUCER");
    mocks.participant.findMany.mockResolvedValue([{ userId: "u-otto", state: "ADMITTED" }]);
    const response = await detailPatch(json("PATCH", { inviteeUserIds: ["u-abby"] }), params);
    expect(response.status).toBe(200);
    expect(mocks.participant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { meetingId: "m1", userId: "u-otto", state: "ADMITTED" }, data: expect.objectContaining({ state: "REMOVED" }) })
    );
    expect(mocks.rotateKey).toHaveBeenCalledWith("m1");
    expect(mocks.roomEvent.mock.calls.map((call) => call[1].t)).toEqual(["removed", "rekey"]);
    expect(mocks.scribeRekey).toHaveBeenCalledWith("m1", { key: "new", epoch: 1 });
  });

  it("only hosts edit the list (an invited associate producer can't)", async () => {
    expect((await detailPatch(json("PATCH", { inviteeUserIds: ["u-abby"] }), params)).status).toBe(403);
  });
});

describe("visibleMeetingWhere (lists)", () => {
  it("includes EXECS_ONLY only for execs, and INVITE_ONLY only when on it", () => {
    const producer = visibleMeetingWhere({ userId: "u-abby", name: "Abby", role: "ASSOCIATE_PRODUCER" });
    expect(producer).toEqual({
      OR: [
        { access: "OPEN" },
        { access: "INVITE_ONLY", OR: [{ createdById: "u-abby" }, { inviteeUserIds: { has: "u-abby" } }] }
      ]
    });
    const exec = visibleMeetingWhere({ userId: "u-sage", name: "Sage", role: "EXECUTIVE_PRODUCER" });
    expect(exec.OR).toContainEqual({ access: "EXECS_ONLY" });
  });
});

describe("GET /api/meetings/people", () => {
  it("lists producers by display name", async () => {
    const response = await peopleGet();
    expect((await response.json()).data.people).toEqual([
      { id: "u-abby", name: "Abby" },
      { id: "u-otto", name: "O." },
      { id: "u-sage", name: "Sage" }
    ]);
  });

  it("is producer-only", async () => {
    as("u-reporter", null);
    expect((await peopleGet()).status).toBe(403);
  });
});

describe("producer series stable link", () => {
  const now = new Date("2026-10-05T05:30:00.000Z");

  it("prefers the live occurrence", async () => {
    mocks.meeting.findFirst.mockResolvedValueOnce({ id: "live-1" });
    await expect(resolveProducerSeriesMeetingId(now)).resolves.toBe("live-1");
  });

  it("else the next scheduled one that hasn't ended", async () => {
    mocks.meeting.findFirst.mockResolvedValueOnce(null);
    mocks.meeting.findMany.mockResolvedValueOnce([
      { id: "over", startsAt: new Date("2026-10-05T04:15:00.000Z"), durationMinutes: 60 },
      { id: "next", startsAt: new Date("2026-10-06T04:15:00.000Z"), durationMinutes: 60 }
    ]);
    await expect(resolveProducerSeriesMeetingId(now)).resolves.toBe("next");
  });

  it("404s from the route when there is none", async () => {
    mocks.meeting.findFirst.mockResolvedValueOnce(null);
    mocks.meeting.findMany.mockResolvedValueOnce([]);
    expect((await seriesGet()).status).toBe(404);
  });
});

describe("calendar invite routes", () => {
  const inviteRow = { id: "i1", email: "guest@example.edu", name: "Guest", userId: null, createdAt: new Date(), lastInvitedAt: null };
  const sync = { name: MEETING_CALENDAR_EVENT, data: { kind: "sync" } };

  it("lets producers read (with the Calendar status) but only execs change or sync", async () => {
    mocks.invite.findMany.mockResolvedValue([inviteRow]);
    const list = await invitesGet();
    expect((await list.json()).data).toMatchObject({
      canManage: false,
      invites: [{ email: "guest@example.edu" }],
      calendar: { connected: true, accountEmail: "infocus@example.edu", lastSyncError: "Google Calendar refused (HTTP 403)" }
    });
    expect((await invitesPost(json("POST", { email: "guest@example.edu" }))).status).toBe(403);
    expect((await inviteDelete(json("DELETE"), { params: Promise.resolve({ id: "i1" }) })).status).toBe(403);
    expect((await sendAllPost()).status).toBe(403);
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("adding an address (lowercased) queues a Calendar sync; nothing is emailed by the Portal", async () => {
    as("u-sage", "EXECUTIVE_PRODUCER");
    mocks.invite.upsert.mockResolvedValue(inviteRow);
    const response = await invitesPost(json("POST", { email: "Guest@Example.edu", name: "Guest" }));
    expect(response.status).toBe(201);
    expect(mocks.invite.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { seriesKey_email: { seriesKey: "producers", email: "guest@example.edu" } } })
    );
    expect(mocks.inngestSend).toHaveBeenCalledWith(sync);
    expect((await response.json()).data).toMatchObject({ queued: true });
  });

  it("removing an address deletes it and queues a sync (Google sends the cancellation)", async () => {
    as("u-sage", "EXECUTIVE_PRODUCER");
    mocks.invite.findFirst.mockResolvedValue(inviteRow);
    expect((await inviteDelete(json("DELETE"), { params: Promise.resolve({ id: "i1" }) })).status).toBe(200);
    expect(mocks.invite.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
    expect(mocks.inngestSend).toHaveBeenCalledWith(sync);
  });

  it("moving or cancelling a series slot queues that occurrence's Calendar update", async () => {
    as("u-sage", "EXECUTIVE_PRODUCER");
    const slot = {
      ...inviteOnly,
      title: "InFocus Producer Meeting",
      status: "SCHEDULED",
      access: "OPEN",
      createdById: null,
      inviteeUserIds: [],
      seriesKey: "producers",
      occurrenceKey: "2026-11-01"
    };
    mocks.meeting.findUnique.mockResolvedValue(slot);
    mocks.meeting.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...slot,
      ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
    }));
    const occurrence = { name: MEETING_CALENDAR_EVENT, data: { kind: "occurrence", occurrenceKey: "2026-11-01" } };
    await detailPatch(json("PATCH", { startsAt: "2026-11-02T06:00:00.000Z" }), params);
    expect(mocks.inngestSend).toHaveBeenLastCalledWith(occurrence);
    mocks.inngestSend.mockClear();
    await detailPatch(json("PATCH", { status: "CANCELED" }), params);
    expect(mocks.inngestSend).toHaveBeenLastCalledWith(occurrence);
    mocks.inngestSend.mockClear();
    await detailPatch(json("PATCH", { quickAccess: true }), params);
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("changing a one-off meeting with an event queues its reconcile (invitees, time, cancel)", async () => {
    as("u-sage", "EXECUTIVE_PRODUCER");
    mocks.meeting.findUnique.mockResolvedValue({ ...inviteOnly, status: "SCHEDULED", calendarSequence: 1 });
    await detailPatch(json("PATCH", { inviteeUserIds: ["u-abby"] }), params);
    expect(mocks.inngestSend).toHaveBeenLastCalledWith({ name: MEETING_CALENDAR_EVENT, data: { kind: "event", meetingId: "m1" } });
  });

  it("Sync now queues a full reconcile", async () => {
    as("u-sage", "EXECUTIVE_PRODUCER");
    const response = await sendAllPost();
    expect((await response.json()).data).toEqual({ queued: true });
    expect(mocks.inngestSend).toHaveBeenCalledWith(sync);
  });

  it("links an address to a producer (exec only, producers only)", async () => {
    const linkParams = { params: Promise.resolve({ id: "i1" }) };
    expect((await invitePatch(json("PATCH", { userId: "u-otto" }), linkParams)).status).toBe(403);

    as("u-sage", "EXECUTIVE_PRODUCER");
    mocks.invite.findFirst.mockResolvedValue({ id: "i1" });
    expect((await invitePatch(json("PATCH", { userId: "u-stranger" }), linkParams)).status).toBe(400);
    mocks.invite.update.mockResolvedValue({ ...inviteRow, userId: "u-otto" });
    const response = await invitePatch(json("PATCH", { userId: "u-otto" }), linkParams);
    expect((await response.json()).data.invite).toMatchObject({ userId: "u-otto", userName: "O." });
    expect(mocks.invite.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "i1" }, data: { userId: "u-otto" } }));

    mocks.invite.update.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    const taken = await invitePatch(json("PATCH", { userId: "u-otto" }), linkParams);
    expect(taken.status).toBe(400);
    expect((await taken.json()).error.message).toMatch(/already has an address/);
  });

  it("rejects a bad address", async () => {
    as("u-sage", "EXECUTIVE_PRODUCER");
    expect((await invitesPost(json("POST", { email: "not-an-email" }))).status).toBe(400);
  });
});
