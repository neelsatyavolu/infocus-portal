import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  viewer: { id: "u-abby", role: "ASSOCIATE_PRODUCER" as string | null, signedIn: true },
  meeting: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  participant: { findUnique: vi.fn() },
  ensureKey: vi.fn(),
  readKey: vi.fn(),
  roomEvent: vi.fn(),
  scribeStart: vi.fn(),
  scribeStop: vi.fn(),
  scribeRekey: vi.fn(),
  usage: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => {
    if (!mocks.viewer.signedIn) throw new Error("UNAUTHORIZED");
    return mocks.viewer.id;
  }),
  syncUserProfile: vi.fn(async () => ({ id: mocks.viewer.id, email: `${mocks.viewer.id}@example.edu`, name: "Viewer", nickname: null }))
}));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/platform-admin")>()),
  getPlatformAccess: vi.fn(async () => ({ role: mocks.viewer.role }))
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: { meeting: mocks.meeting, meetingParticipant: mocks.participant } }));
vi.mock("@/src/server/meetings-keys", () => ({
  ensureMeetingKey: mocks.ensureKey,
  readMeetingKey: mocks.readKey,
  sealedNewMeetingKey: () => "v1.sealed",
  rotateMeetingKey: vi.fn()
}));
vi.mock("@/src/server/meetings-scribe", () => ({
  startMeetingScribe: mocks.scribeStart,
  stopMeetingScribe: mocks.scribeStop,
  rekeyMeetingScribe: mocks.scribeRekey
}));
vi.mock("@/src/server/meetings-usage", () => ({ checkMeetingUsage: mocks.usage, MEETING_USAGE_LIMIT_MESSAGE: "over" }));
vi.mock("@/src/server/meetings-room-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/server/meetings-room-client")>()),
  sendMeetingRoomEvent: mocks.roomEvent
}));

import { POST as ticketPost } from "@/app/api/meetings/[id]/ticket/route";
import { verifyMeetingRoomToken } from "@/src/lib/meetings/room-token";
import { endStaleMeetings, reticketScribes } from "@/src/server/meetings-housekeeping";
import { endMeeting } from "@/src/server/meetings-moderation";
import { applyMeetingNotesUpdate, notesUpdateData, sweepStuckNotes } from "@/src/server/meetings-notes";
import { REOPEN_WINDOW_MS, isReopenable } from "@/src/server/meetings-reopen";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-10-05T05:00:00.000Z");
const key = { key: "k".repeat(43), epoch: 4 };
const params = { params: Promise.resolve({ id: "m1" }) };

function meeting(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    status: "LIVE",
    startsAt: new Date(NOW.getTime() - 30 * 60_000),
    access: "OPEN",
    createdById: "u-otto",
    inviteeUserIds: [] as string[],
    endedReason: null,
    endedAt: null,
    roomGeneration: 2,
    ...overrides
  };
}

const ticket = () => ticketPost(new Request("https://portal.example.edu/api/meetings/m1/ticket", { method: "POST" }), params);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("MEETING_ROOM_SECRET", SECRET);
  vi.stubEnv("MEETING_ROOM_URL", "https://meet-room.example.edu");
  Object.assign(mocks.viewer, { id: "u-abby", role: "ASSOCIATE_PRODUCER", signedIn: true });
  mocks.meeting.findUnique.mockResolvedValue(meeting());
  mocks.meeting.updateMany.mockResolvedValue({ count: 1 });
  mocks.participant.findUnique.mockResolvedValue({ state: "ADMITTED", promotedHost: false });
  mocks.ensureKey.mockResolvedValue(key);
  mocks.readKey.mockReturnValue(key);
  mocks.roomEvent.mockResolvedValue(true);
  mocks.usage.mockResolvedValue("allowed");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/meetings/[id]/ticket", () => {
  it("returns a fresh member ticket for the current room generation, the room URL and the key, never cached", async () => {
    const response = await ticket();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const { data } = await response.json();
    expect(data).toMatchObject({ roomUrl: "https://meet-room.example.edu", key });
    expect(await verifyMeetingRoomToken(data.roomToken, SECRET, NOW.getTime())).toMatchObject({
      mid: "m1",
      uid: "u-abby",
      role: "member",
      adm: true,
      gen: 2,
      exp: NOW.getTime() + 4 * 60 * 60 * 1000
    });
  });

  it("gives hosts (execs, creators, promoted hosts) a host ticket; execs carry exec", async () => {
    Object.assign(mocks.viewer, { id: "u-sage", role: "EXECUTIVE_PRODUCER" });
    const exec = (await (await ticket()).json()).data;
    expect(await verifyMeetingRoomToken(exec.roomToken, SECRET, NOW.getTime())).toMatchObject({ role: "host", exec: true });

    Object.assign(mocks.viewer, { id: "u-abby", role: "ASSOCIATE_PRODUCER" });
    mocks.participant.findUnique.mockResolvedValue({ state: "ADMITTED", promotedHost: true });
    const promoted = (await (await ticket()).json()).data;
    expect(await verifyMeetingRoomToken(promoted.roomToken, SECRET, NOW.getTime())).toMatchObject({ role: "host" });
  });

  it("401 signed out, 403 not admitted or removed, 410 ended or cancelled, 404 can't see it", async () => {
    mocks.viewer.signedIn = false;
    expect((await ticket()).status).toBe(401);
    mocks.viewer.signedIn = true;

    for (const state of ["WAITING", "REMOVED", "DENIED"]) {
      mocks.participant.findUnique.mockResolvedValue({ state, promotedHost: false });
      expect((await ticket()).status).toBe(403);
    }
    mocks.participant.findUnique.mockResolvedValue({ state: "ADMITTED", promotedHost: false });

    for (const status of ["ENDED", "CANCELED"]) {
      mocks.meeting.findUnique.mockResolvedValue(meeting({ status, endedReason: "HOST", endedAt: NOW }));
      expect((await ticket()).status).toBe(410);
    }
    mocks.meeting.findUnique.mockResolvedValue(meeting({ access: "EXECS_ONLY" }));
    expect((await ticket()).status).toBe(404);
  });

  it("a removal racing the refresh refuses the ticket (key read first, state second)", async () => {
    mocks.participant.findUnique
      .mockResolvedValueOnce({ state: "ADMITTED", promotedHost: false })
      .mockResolvedValueOnce({ state: "ADMITTED", promotedHost: false })
      .mockResolvedValueOnce({ state: "REMOVED", promotedHost: false });
    expect((await ticket()).status).toBe(403);
  });
});

describe("reopening a meeting that ended because everyone left", () => {
  it("only EMPTY ends within 15 minutes are reopenable", () => {
    const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000);
    expect(isReopenable({ status: "ENDED", endedReason: "EMPTY", endedAt: at(14) }, NOW)).toBe(true);
    expect(isReopenable({ status: "ENDED", endedReason: "EMPTY", endedAt: at(16) }, NOW)).toBe(false);
    expect(isReopenable({ status: "ENDED", endedReason: "HOST", endedAt: at(1) }, NOW)).toBe(false);
    expect(isReopenable({ status: "ENDED", endedReason: "STALE", endedAt: at(1) }, NOW)).toBe(false);
    expect(isReopenable({ status: "LIVE", endedReason: null, endedAt: null }, NOW)).toBe(false);
  });

  it("a ticket refresh reopens it: LIVE, new key epoch, next generation, notes restarted, room told the epoch", async () => {
    const ended = meeting({ status: "ENDED", endedReason: "EMPTY", endedAt: new Date(NOW.getTime() - 5 * 60_000), roomGeneration: 2 });
    mocks.meeting.findUnique
      .mockResolvedValueOnce(ended) // load
      .mockResolvedValueOnce({ id: "m1", title: "Rundown", startsAt: NOW, notesEnabled: true, keyCiphertext: "v1.sealed", keyEpoch: 5, roomGeneration: 3 }) // after reopen
      .mockResolvedValueOnce(meeting({ roomGeneration: 3 })); // reload
    mocks.readKey.mockReturnValue({ key: key.key, epoch: 5 });
    const response = await ticket();
    expect(response.status).toBe(200);
    expect(mocks.meeting.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", status: "ENDED", endedReason: "EMPTY", endedAt: { gte: new Date(NOW.getTime() - REOPEN_WINDOW_MS) } },
      data: {
        status: "LIVE",
        endedAt: null,
        endedReason: null,
        roomGeneration: { increment: 1 },
        keyCiphertext: "v1.sealed",
        keyEpoch: { increment: 1 }
      }
    });
    expect(mocks.roomEvent).toHaveBeenCalledWith("m1", { t: "rekey", epoch: 5 });
    expect(mocks.scribeStart).toHaveBeenCalled();
    const { data } = await response.json();
    expect((await verifyMeetingRoomToken(data.roomToken, SECRET, NOW.getTime()))?.gen).toBe(3);
  });

  it("a host's End for everyone is final: no reopen, 410", async () => {
    mocks.meeting.findUnique.mockResolvedValue(meeting({ status: "ENDED", endedReason: "HOST", endedAt: NOW }));
    expect((await ticket()).status).toBe(410);
    expect(mocks.meeting.updateMany).not.toHaveBeenCalled();
  });
});

describe("ended reaches the room", () => {
  it("records the reason, and ending an ended meeting re-sends `ended` (retried once)", async () => {
    mocks.meeting.findUnique.mockResolvedValue({ status: "LIVE", notesEnabled: true, endedReason: null });
    await endMeeting("m1", NOW, "EMPTY");
    expect(mocks.meeting.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", status: { in: ["SCHEDULED", "LIVE"] } },
      data: { status: "ENDED", endedAt: NOW, endedReason: "EMPTY", keyCiphertext: null }
    });
    expect(mocks.scribeStop).toHaveBeenCalledWith("m1");

    mocks.roomEvent.mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mocks.meeting.updateMany.mockReset().mockResolvedValue({ count: 0 });
    mocks.meeting.findUnique.mockResolvedValue({ status: "ENDED", notesEnabled: true, endedReason: "EMPTY" });
    await expect(endMeeting("m1", NOW, "EMPTY")).resolves.toEqual({ ended: false });
    expect(mocks.roomEvent).toHaveBeenCalledTimes(2);
    expect(mocks.roomEvent).toHaveBeenLastCalledWith("m1", { t: "ended" });
  });

  it("a host's End on an EMPTY-ended meeting makes it final", async () => {
    mocks.meeting.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    mocks.meeting.findUnique.mockResolvedValue({ status: "ENDED", notesEnabled: true, endedReason: "EMPTY" });
    await endMeeting("m1", NOW, "HOST");
    expect(mocks.meeting.updateMany).toHaveBeenLastCalledWith({
      where: { id: "m1", status: "ENDED", endedReason: "EMPTY" },
      data: { endedReason: "HOST" }
    });
    expect(mocks.roomEvent).toHaveBeenCalledWith("m1", { t: "ended" });
  });
});

describe("housekeeping", () => {
  it("ends LIVE meetings past start + 8 h as STALE", async () => {
    mocks.meeting.findMany.mockResolvedValue([{ id: "m1" }]);
    mocks.meeting.findUnique.mockResolvedValue({ status: "LIVE", notesEnabled: false, endedReason: null });
    expect(await endStaleMeetings(NOW)).toBe(1);
    expect(mocks.meeting.findMany).toHaveBeenCalledWith({
      where: { status: "LIVE", startsAt: { lt: new Date(NOW.getTime() - 8 * 60 * 60 * 1000) } },
      select: { id: true }
    });
    expect(mocks.meeting.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ endedReason: "STALE" }) }));
    expect(mocks.roomEvent).toHaveBeenCalledWith("m1", { t: "ended" });
  });

  it("re-tickets every recording Scribe", async () => {
    mocks.meeting.findMany.mockResolvedValue([{ id: "m1", keyCiphertext: "c", keyEpoch: 4 }]);
    mocks.scribeRekey.mockResolvedValue(true);
    expect(await reticketScribes()).toEqual({ scribes: 1, sent: 1 });
    expect(mocks.meeting.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "LIVE", notesEnabled: true, notesStatus: "RECORDING" } }));
    expect(mocks.scribeRekey).toHaveBeenCalledWith("m1", key);
  });

  it("marks notes stuck PROCESSING 12 h, or RECORDING an hour after the end, FAILED with a reason", async () => {
    mocks.meeting.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });
    expect(await sweepStuckNotes(NOW)).toEqual({ processing: 2, recording: 1 });
    const [processing, recording] = mocks.meeting.updateMany.mock.calls.map((call) => call[0]);
    expect(processing.data).toMatchObject({ notesStatus: "FAILED", notesError: expect.stringMatching(/12 hours/) });
    expect(recording.where).toEqual({ status: "ENDED", notesStatus: "RECORDING", endedAt: { lt: new Date(NOW.getTime() - 60 * 60 * 1000) } });
  });
});

describe("notes in parts", () => {
  const row = { notesPart: 2, notesDrivePaths: ["Meetings/part1"], notesSummary: "Part one summary" };

  it("appends a later part's summary under 'Part 2' and keeps every folder", () => {
    const { data } = notesUpdateData(row, { status: "READY", summaryMarkdown: "Part two summary", drivePath: "Meetings/part2", part: 2 }, NOW);
    expect(data.notesDrivePaths).toEqual(["Meetings/part1", "Meetings/part2"]);
    expect(data.notesSummary).toBe("Part one summary\n\n## Part 2\n\nPart two summary");
    expect(data.notesStatus).toBe("READY");
  });

  it("an older part's callback never changes the current status (a new RECORDING can't hide part 1)", () => {
    const { data, current } = notesUpdateData(row, { status: "FAILED", part: 1 }, NOW);
    expect(current).toBe(false);
    expect(data).not.toHaveProperty("notesStatus");
  });

  it("ignores a repeated READY for a part it already has", () => {
    const { data } = notesUpdateData({ ...row, notesDrivePaths: ["Meetings/part1", "Meetings/part2"] }, { status: "READY", summaryMarkdown: "again", drivePath: "Meetings/part2", part: 2 }, NOW);
    expect(data).not.toHaveProperty("notesSummary");
    expect(data).not.toHaveProperty("notesDrivePaths");
  });

  it("a retried READY for part 1 keeps the later parts' summaries", () => {
    const twoParts = { ...row, notesDrivePaths: ["Meetings/part1", "Meetings/part2"], notesSummary: "one\n\n## Part 2\n\ntwo" };
    const { data } = notesUpdateData(twoParts, { status: "READY", summaryMarkdown: "one", drivePath: "Meetings/part1", part: 1 }, NOW);
    expect(data).not.toHaveProperty("notesSummary");
  });

  it("restarts a stopped Scribe while the meeting is LIVE (claimed: at most once per 10 minutes)", async () => {
    mocks.meeting.findUnique
      .mockResolvedValueOnce({ id: "m1", status: "LIVE", notesEnabled: true, notesPart: 1, notesDrivePaths: [], notesSummary: null })
      .mockResolvedValueOnce({ id: "m1", title: "Rundown", startsAt: NOW, keyCiphertext: "c", keyEpoch: 4 });
    mocks.meeting.updateMany.mockResolvedValue({ count: 1 });
    mocks.scribeStart.mockResolvedValue(true);
    await applyMeetingNotesUpdate("m1", { status: "PROCESSING", part: 1 }, NOW);
    expect(mocks.meeting.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "m1",
        status: "LIVE",
        notesEnabled: true,
        OR: [{ scribeStartedAt: null }, { scribeStartedAt: { lte: new Date(NOW.getTime() - 10 * 60_000) } }]
      }),
      data: { scribeStartedAt: NOW }
    });
    expect(mocks.scribeStart).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }), key, NOW);

    // Throttled (claim lost) or the meeting ended: no restart.
    mocks.scribeStart.mockClear();
    mocks.meeting.updateMany.mockResolvedValue({ count: 0 });
    mocks.meeting.findUnique.mockResolvedValueOnce({ id: "m1", status: "LIVE", notesEnabled: true, notesPart: 2, notesDrivePaths: [], notesSummary: null });
    await applyMeetingNotesUpdate("m1", { status: "FAILED", part: 2 }, NOW);
    mocks.meeting.findUnique.mockResolvedValueOnce({ id: "m1", status: "ENDED", notesEnabled: true, notesPart: 2, notesDrivePaths: [], notesSummary: null });
    await applyMeetingNotesUpdate("m1", { status: "PROCESSING", part: 2 }, NOW);
    expect(mocks.scribeStart).not.toHaveBeenCalled();
  });
});
