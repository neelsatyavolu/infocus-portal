import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  meetingFindUnique: vi.fn(),
  meetingFindUniqueOrThrow: vi.fn(),
  meetingUpdateMany: vi.fn(),
  participantFindUnique: vi.fn(),
  participantCreate: vi.fn(),
  participantUpdate: vi.fn(),
  participantFindMany: vi.fn(),
  participantUpdateMany: vi.fn(),
  ensureKey: vi.fn(),
  rotateKey: vi.fn(),
  readKey: vi.fn(),
  roomEvent: vi.fn(),
  scribeStart: vi.fn(),
  scribeRekey: vi.fn(),
  scribeStop: vi.fn(),
  usage: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    meeting: {
      findUnique: mocks.meetingFindUnique,
      findUniqueOrThrow: mocks.meetingFindUniqueOrThrow,
      updateMany: mocks.meetingUpdateMany
    },
    meetingParticipant: {
      findUnique: mocks.participantFindUnique,
      create: mocks.participantCreate,
      update: mocks.participantUpdate,
      findMany: mocks.participantFindMany,
      updateMany: mocks.participantUpdateMany
    }
  }
}));
vi.mock("@/src/lib/auth", () => ({ requireUserId: vi.fn(), syncUserProfile: vi.fn() }));
vi.mock("@/src/server/meetings-keys", () => ({
  ensureMeetingKey: mocks.ensureKey,
  rotateMeetingKey: mocks.rotateKey,
  readMeetingKey: mocks.readKey
}));
vi.mock("@/src/server/meetings-scribe", () => ({
  startMeetingScribe: mocks.scribeStart,
  rekeyMeetingScribe: mocks.scribeRekey,
  stopMeetingScribe: mocks.scribeStop
}));
vi.mock("@/src/server/meetings-usage", () => ({ checkMeetingUsage: mocks.usage, MEETING_USAGE_LIMIT_MESSAGE: "over limit" }));
vi.mock("@/src/server/meetings-room-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/server/meetings-room-client")>()),
  sendMeetingRoomEvent: mocks.roomEvent
}));

import { verifyMeetingRoomToken } from "@/src/lib/meetings/room-token";
import { REMOVED_WHILE_JOINING, getMeetingKeyForViewer, joinMeeting } from "@/src/server/meetings-join";
import { ROOM_UPDATE_FAILED, actOnParticipant, endMeeting } from "@/src/server/meetings-moderation";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-10-05T04:15:00.000Z");
const key = { key: "a".repeat(43), epoch: 0 };
const producer = { userId: "u-abby", name: "Abby", role: "ASSOCIATE_PRODUCER" as const };
const exec = { userId: "u-sage", name: "Sage", role: "EXECUTIVE_PRODUCER" as const };

function meetingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    status: "SCHEDULED",
    startsAt: NOW,
    access: "OPEN",
    createdById: "u-otto",
    inviteeUserIds: [] as string[],
    quickAccess: false,
    notesEnabled: true,
    ...overrides
  };
}

const summaryRow = {
  id: "m1",
  title: "Producer meeting",
  startsAt: NOW,
  durationMinutes: 60,
  status: "LIVE",
  access: "OPEN",
  inviteeUserIds: [],
  seriesKey: "producers",
  createdById: null,
  notesEnabled: true,
  quickAccess: false,
  notesStatus: "NONE",
  createdBy: null,
  _count: { participants: 1 }
};

beforeEach(() => {
  // Reset (not just clear) so queued mockResolvedValueOnce values never leak between tests.
  vi.resetAllMocks();
  vi.stubEnv("MEETING_ROOM_SECRET", SECRET);
  vi.stubEnv("MEETING_ROOM_URL", "https://meet.example.edu/");
  mocks.meetingFindUnique.mockResolvedValue(meetingRow());
  mocks.meetingFindUniqueOrThrow.mockResolvedValue(summaryRow);
  mocks.meetingUpdateMany.mockResolvedValue({ count: 1 });
  mocks.participantFindUnique.mockResolvedValue(null);
  mocks.participantCreate.mockResolvedValue({});
  mocks.participantUpdate.mockResolvedValue({});
  mocks.participantFindMany.mockResolvedValue([]);
  mocks.participantUpdateMany.mockResolvedValue({ count: 1 });
  mocks.ensureKey.mockResolvedValue(key);
  mocks.rotateKey.mockResolvedValue({ key: "b".repeat(43), epoch: 1 });
  mocks.usage.mockResolvedValue("allowed");
  mocks.roomEvent.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("joinMeeting", () => {
  it("lets a host straight in, goes LIVE, starts the Scribe and returns an admitted ticket + key", async () => {
    mocks.meetingFindUnique
      .mockResolvedValueOnce(meetingRow())
      .mockResolvedValueOnce({ id: "m1", title: "Producer meeting", startsAt: NOW, notesEnabled: true });
    const result = await joinMeeting(exec, "m1", NOW);

    expect(result).toMatchObject({ state: "ADMITTED", isHost: true, key, roomUrl: "https://meet.example.edu", self: { uid: "u-sage", name: "Sage" } });
    expect(mocks.meetingUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", status: "SCHEDULED" },
      data: { status: "LIVE", startedAt: NOW }
    });
    expect(mocks.scribeStart).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }), key);
    const ticket = await verifyMeetingRoomToken(result.roomToken, SECRET, NOW.getTime());
    expect(ticket).toMatchObject({ mid: "m1", uid: "u-sage", name: "Sage", role: "host", adm: true, iat: NOW.getTime() });
  });

  it("makes a producer knock: waiting ticket, no key, no LIVE flip", async () => {
    const result = await joinMeeting(producer, "m1", NOW);
    expect(result.state).toBe("WAITING");
    expect(result.key).toBeUndefined();
    expect(mocks.ensureKey).not.toHaveBeenCalled();
    expect(mocks.meetingUpdateMany).not.toHaveBeenCalled();
    expect(mocks.participantCreate).toHaveBeenCalledWith({
      data: { meetingId: "m1", userId: "u-abby", state: "WAITING", firstJoinedAt: NOW, lastJoinedAt: NOW }
    });
    const ticket = await verifyMeetingRoomToken(result.roomToken, SECRET, NOW.getTime());
    expect(ticket).toMatchObject({ role: "member", adm: false });
  });

  it("does not start the Scribe when notes are off", async () => {
    // Promoted-host check (none), admission read (new), re-check after the key.
    mocks.participantFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ state: "ADMITTED" });
    mocks.meetingFindUnique
      .mockResolvedValueOnce(meetingRow({ quickAccess: true }))
      .mockResolvedValueOnce({ id: "m1", title: "Producer meeting", startsAt: NOW, notesEnabled: false });
    expect((await joinMeeting(producer, "m1", NOW)).state).toBe("ADMITTED");
    expect(mocks.scribeStart).not.toHaveBeenCalled();
  });

  it("refuses ended and cancelled meetings, and new LIVE starts over the usage limit", async () => {
    mocks.meetingFindUnique.mockResolvedValueOnce(meetingRow({ status: "ENDED" }));
    await expect(joinMeeting(exec, "m1", NOW)).rejects.toThrow("This meeting has ended.");
    mocks.meetingFindUnique.mockResolvedValueOnce(meetingRow({ status: "CANCELED" }));
    await expect(joinMeeting(exec, "m1", NOW)).rejects.toThrow("This meeting was cancelled.");
    mocks.usage.mockResolvedValueOnce("over");
    await expect(joinMeeting(exec, "m1", NOW)).rejects.toThrow("over limit");
    expect(mocks.participantCreate).not.toHaveBeenCalled();
  });

  it("opens scheduled meetings 5 minutes early, for hosts too, with a clear message", async () => {
    const startsAt = new Date("2026-10-05T04:15:00.000Z"); // 9:15 PM Pacific
    mocks.meetingFindUnique.mockResolvedValue(meetingRow({ startsAt }));
    const early = new Date(startsAt.getTime() - 6 * 60_000);
    await expect(joinMeeting(exec, "m1", early)).rejects.toThrow("This meeting opens at 9:10 PM.");
    await expect(joinMeeting(producer, "m1", early)).rejects.toThrow("This meeting opens at 9:10 PM.");
    expect(mocks.participantCreate).not.toHaveBeenCalled();

    const dayBefore = new Date(startsAt.getTime() - 24 * 3600_000);
    await expect(joinMeeting(exec, "m1", dayBefore)).rejects.toThrow("This meeting opens at Sunday, October 4 at 9:10 PM.");

    mocks.meetingFindUnique.mockReset();
    mocks.meetingFindUnique
      .mockResolvedValueOnce(meetingRow({ startsAt }))
      .mockResolvedValueOnce({ id: "m1", title: "t", startsAt, notesEnabled: false });
    const onTime = new Date(startsAt.getTime() - 5 * 60_000);
    expect((await joinMeeting(exec, "m1", onTime)).state).toBe("ADMITTED");
  });

  it("LIVE meetings stay joinable before their planned start", async () => {
    const startsAt = new Date(NOW.getTime() + 60 * 60_000);
    mocks.meetingFindUnique.mockResolvedValue(meetingRow({ status: "LIVE", startsAt }));
    expect((await joinMeeting(exec, "m1", NOW)).state).toBe("ADMITTED");
  });

  it("refuses when the room is not configured", async () => {
    vi.stubEnv("MEETING_ROOM_URL", "");
    await expect(joinMeeting(exec, "m1", NOW)).rejects.toThrow(/MEETING_ROOM_URL/);
  });
});

describe("joinMeeting races (compare-and-set)", () => {
  it("a removal landing between the read and the write wins: not admitted, no key", async () => {
    mocks.participantFindUnique
      .mockResolvedValueOnce({ promotedHost: false, state: "ADMITTED" }) // promoted-host check
      .mockResolvedValueOnce({ state: "ADMITTED" }) // rejoin read
      .mockResolvedValueOnce({ state: "REMOVED" }); // re-read after losing the race
    mocks.participantUpdateMany
      .mockResolvedValueOnce({ count: 0 }) // where state ADMITTED: the host already flipped it
      .mockResolvedValueOnce({ count: 1 }); // where state REMOVED -> WAITING (knock again)

    const result = await joinMeeting(producer, "m1", NOW);
    expect(result.state).toBe("WAITING");
    expect(result.key).toBeUndefined();
    expect(mocks.ensureKey).not.toHaveBeenCalled();
    expect(mocks.participantUpdateMany.mock.calls.map((call) => call[0].where.state)).toEqual(["ADMITTED", "REMOVED"]);
    expect(mocks.participantUpdateMany.mock.calls.map((call) => call[0].data.state)).toEqual(["ADMITTED", "WAITING"]);
    const ticket = await verifyMeetingRoomToken(result.roomToken, SECRET, NOW.getTime());
    expect(ticket?.adm).toBe(false);
  });

  it("a removal landing after the write but before the key read refuses the join", async () => {
    mocks.participantFindUnique
      .mockResolvedValueOnce({ promotedHost: false, state: "ADMITTED" }) // promoted-host check
      .mockResolvedValueOnce({ state: "ADMITTED" })
      .mockResolvedValueOnce({ state: "REMOVED" }); // re-check after reading the key
    await expect(joinMeeting(producer, "m1", NOW)).rejects.toThrow(REMOVED_WHILE_JOINING);
    expect(mocks.meetingUpdateMany).not.toHaveBeenCalled();
  });

  it("never lets quick access lift a denial or a removal", async () => {
    mocks.meetingFindUnique.mockResolvedValue(meetingRow({ quickAccess: true }));
    for (const previous of ["DENIED", "REMOVED"]) {
      mocks.participantFindUnique.mockResolvedValueOnce({ promotedHost: false, state: previous }).mockResolvedValueOnce({ state: previous });
      expect((await joinMeeting(producer, "m1", NOW)).state).toBe("WAITING");
    }
    expect(mocks.ensureKey).not.toHaveBeenCalled();
  });

  it("re-reads after a unique conflict on first join", async () => {
    mocks.participantFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ state: "WAITING" });
    mocks.participantCreate.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await joinMeeting(producer, "m1", NOW)).state).toBe("WAITING");
    expect(mocks.participantUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { meetingId: "m1", userId: "u-abby", state: "WAITING" } })
    );
  });

  it("refuses after repeated lost races", async () => {
    mocks.participantFindUnique.mockResolvedValue({ state: "WAITING" });
    mocks.participantUpdateMany.mockResolvedValue({ count: 0 });
    await expect(joinMeeting(producer, "m1", NOW)).rejects.toThrow("CONFLICT");
  });
});

describe("getMeetingKeyForViewer", () => {
  it("only hands the key to admitted participants", async () => {
    mocks.meetingFindUnique.mockResolvedValue(meetingRow({ status: "LIVE", keyCiphertext: "sealed", keyEpoch: 2 }));
    mocks.participantFindUnique.mockResolvedValueOnce({ state: "WAITING" });
    await expect(getMeetingKeyForViewer(producer, "m1")).rejects.toThrow("FORBIDDEN");
    mocks.participantFindUnique.mockResolvedValueOnce({ state: "ADMITTED" });
    mocks.readKey.mockReturnValueOnce({ key: "k", epoch: 2 });
    await expect(getMeetingKeyForViewer(producer, "m1")).resolves.toEqual({ key: "k", epoch: 2 });
  });
});

describe("promoted hosts (room handed host over)", () => {
  it("join as host with a host ticket; execs' tickets carry exec", async () => {
    mocks.participantFindUnique
      .mockResolvedValueOnce({ promotedHost: true, state: "ADMITTED" }) // host check
      .mockResolvedValueOnce({ state: "ADMITTED" }) // admission read
      .mockResolvedValueOnce({ state: "ADMITTED" }); // re-check after the key
    mocks.meetingFindUnique.mockResolvedValue(meetingRow({ status: "LIVE" }));
    const result = await joinMeeting(producer, "m1", NOW);
    expect(result).toMatchObject({ state: "ADMITTED", isHost: true, meeting: { isHost: true, canEdit: true } });
    const ticket = await verifyMeetingRoomToken(result.roomToken, SECRET, NOW.getTime());
    expect(ticket).toMatchObject({ role: "host", adm: true });
    expect(ticket).not.toHaveProperty("exec");

    mocks.meetingFindUnique.mockResolvedValue(meetingRow({ status: "LIVE" }));
    const execJoin = await joinMeeting(exec, "m1", NOW);
    expect(await verifyMeetingRoomToken(execJoin.roomToken, SECRET, NOW.getTime())).toMatchObject({ exec: true, role: "host" });
  });

  it("can admit, but only while still admitted and promoted", async () => {
    mocks.participantFindUnique
      .mockResolvedValueOnce({ promotedHost: true, state: "ADMITTED" }) // host check
      .mockResolvedValueOnce({ state: "WAITING" }); // target
    mocks.participantUpdateMany.mockResolvedValueOnce({ count: 1 });
    await expect(actOnParticipant(producer, "m1", "u-sage", "admit")).resolves.toEqual({ state: "ADMITTED" });

    mocks.participantFindUnique.mockResolvedValueOnce({ promotedHost: true, state: "REMOVED" });
    await expect(actOnParticipant(producer, "m1", "u-sage", "admit")).rejects.toThrow("FORBIDDEN");
    mocks.participantFindUnique.mockResolvedValueOnce({ promotedHost: false, state: "ADMITTED" });
    await expect(actOnParticipant(producer, "m1", "u-sage", "admit")).rejects.toThrow("FORBIDDEN");
  });

  it("removing someone clears their promoted host", async () => {
    mocks.meetingFindUnique.mockResolvedValue(meetingRow({ status: "LIVE" }));
    mocks.participantFindUnique.mockResolvedValue({ state: "ADMITTED" });
    mocks.participantFindMany.mockResolvedValue([{ userId: "u-abby", state: "ADMITTED", removedAt: null }]);
    await actOnParticipant(exec, "m1", "u-abby", "remove", NOW);
    expect(mocks.participantUpdateMany).toHaveBeenCalledWith({
      where: { meetingId: "m1", userId: "u-abby", state: "ADMITTED" },
      data: { state: "REMOVED", removedAt: NOW, promotedHost: false }
    });
  });
});

describe("actOnParticipant", () => {
  it("only lets hosts act", async () => {
    await expect(actOnParticipant(producer, "m1", "u-otto", "admit")).rejects.toThrow("FORBIDDEN");
  });

  it("admits and denies through room events", async () => {
    mocks.participantFindUnique.mockResolvedValue({ state: "WAITING" });
    await actOnParticipant(exec, "m1", "u-abby", "admit");
    expect(mocks.roomEvent).toHaveBeenLastCalledWith("m1", { t: "admitted", uid: "u-abby" });
    await actOnParticipant(exec, "m1", "u-abby", "deny");
    expect(mocks.roomEvent).toHaveBeenLastCalledWith("m1", { t: "denied", uid: "u-abby" });
  });

  it("remove rotates the key, sends removed then rekey, and rekeys the Scribe", async () => {
    mocks.meetingFindUnique.mockResolvedValue(meetingRow({ status: "LIVE" }));
    mocks.participantFindUnique.mockResolvedValue({ state: "ADMITTED" });
    mocks.participantFindMany.mockResolvedValue([{ userId: "u-abby", state: "ADMITTED" }]);
    const result = await actOnParticipant(exec, "m1", "u-abby", "remove", NOW);

    expect(result).toEqual({ state: "REMOVED", epoch: 1 });
    expect(mocks.participantUpdateMany).toHaveBeenCalledWith({
      where: { meetingId: "m1", userId: "u-abby", state: "ADMITTED" },
      data: { state: "REMOVED", removedAt: NOW, promotedHost: false }
    });
    expect(mocks.roomEvent.mock.calls.map((call) => call[1])).toEqual([
      { t: "removed", uid: "u-abby", at: NOW.getTime() },
      { t: "rekey", epoch: 1 }
    ]);
    expect(mocks.scribeRekey).toHaveBeenCalledWith("m1", { key: "b".repeat(43), epoch: 1 });
  });

  it("removing someone who never got the key skips the rekey", async () => {
    mocks.participantFindUnique.mockResolvedValue({ state: "WAITING" });
    mocks.participantFindMany.mockResolvedValue([{ userId: "u-abby", state: "WAITING" }]);
    expect(await actOnParticipant(exec, "m1", "u-abby", "remove", NOW)).toEqual({ state: "REMOVED" });
    expect(mocks.rotateKey).not.toHaveBeenCalled();
    expect(mocks.roomEvent).toHaveBeenCalledWith("m1", { t: "removed", uid: "u-abby", at: NOW.getTime() });
  });

  it("deny only applies to waiting people; denying someone in the call removes them (rotating the key)", async () => {
    mocks.participantFindUnique.mockResolvedValue({ state: "WAITING" });
    await actOnParticipant(exec, "m1", "u-abby", "deny");
    expect(mocks.participantUpdateMany).toHaveBeenCalledWith({
      where: { meetingId: "m1", userId: "u-abby", state: "WAITING" },
      data: { state: "DENIED" }
    });

    mocks.participantFindUnique.mockResolvedValue({ state: "ADMITTED" });
    mocks.participantFindMany.mockResolvedValue([{ userId: "u-abby", state: "ADMITTED", removedAt: null }]);
    expect(await actOnParticipant(exec, "m1", "u-abby", "deny", NOW)).toEqual({ state: "REMOVED", epoch: 1 });
    expect(mocks.rotateKey).toHaveBeenCalledWith("m1");
  });

  it("admit only lifts WAITING or DENIED", async () => {
    mocks.participantFindUnique.mockResolvedValue({ state: "REMOVED" });
    mocks.participantUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(actOnParticipant(exec, "m1", "u-abby", "admit")).rejects.toThrow(/aren't waiting/);
    expect(mocks.participantUpdateMany).toHaveBeenCalledWith({
      where: { meetingId: "m1", userId: "u-abby", state: { in: ["WAITING", "DENIED"] } },
      data: { state: "ADMITTED" }
    });
    expect(mocks.roomEvent).not.toHaveBeenCalled();
  });

  it("retries removed/rekey once, then reports failure; a retry re-sends idempotently", async () => {
    mocks.meetingFindUnique.mockResolvedValue(meetingRow({ status: "LIVE", keyCiphertext: "sealed", keyEpoch: 1 }));
    mocks.participantFindUnique.mockResolvedValue({ state: "ADMITTED" });
    mocks.participantFindMany.mockResolvedValueOnce([{ userId: "u-abby", state: "ADMITTED", removedAt: null }]);
    mocks.roomEvent.mockResolvedValue(false);
    await expect(actOnParticipant(exec, "m1", "u-abby", "remove", NOW)).rejects.toThrow(ROOM_UPDATE_FAILED);
    expect(mocks.roomEvent).toHaveBeenCalledTimes(4); // removed x2, rekey x2
    expect(mocks.rotateKey).toHaveBeenCalledTimes(1);

    // Host presses Remove again: DB already REMOVED and rotated; events go out again, no new rotation.
    mocks.roomEvent.mockReset().mockResolvedValue(true);
    mocks.participantFindUnique.mockResolvedValue({ state: "REMOVED" });
    mocks.participantFindMany.mockResolvedValueOnce([{ userId: "u-abby", state: "REMOVED", removedAt: NOW }]);
    mocks.readKey.mockReturnValueOnce({ key: "b".repeat(43), epoch: 1 });
    const later = new Date(NOW.getTime() + 60_000);
    expect(await actOnParticipant(exec, "m1", "u-abby", "remove", later)).toEqual({ state: "REMOVED", epoch: 1 });
    expect(mocks.rotateKey).toHaveBeenCalledTimes(1);
    expect(mocks.roomEvent.mock.calls.map((call) => call[1])).toEqual([
      { t: "removed", uid: "u-abby", at: NOW.getTime() },
      { t: "rekey", epoch: 1 }
    ]);
  });

  it("a creator host can't remove themselves", async () => {
    const creator = { userId: "u-otto", name: "Otto", role: "ASSOCIATE_PRODUCER" as const };
    await expect(actOnParticipant(creator, "m1", "u-otto", "remove")).rejects.toThrow(/Leave/);
  });
});

describe("endMeeting", () => {
  it("ends once: clears the key, tells the room, stops the Scribe", async () => {
    mocks.meetingFindUnique.mockResolvedValue({ status: "LIVE", notesEnabled: true });
    await expect(endMeeting("m1", NOW)).resolves.toEqual({ ended: true });
    expect(mocks.meetingUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", status: { in: ["SCHEDULED", "LIVE"] } },
      data: { status: "ENDED", endedAt: NOW, keyCiphertext: null }
    });
    expect(mocks.roomEvent).toHaveBeenCalledWith("m1", { t: "ended" });
    expect(mocks.scribeStop).toHaveBeenCalledWith("m1");

    mocks.meetingUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.roomEvent.mockClear();
    await expect(endMeeting("m1", NOW)).resolves.toEqual({ ended: false });
    expect(mocks.roomEvent).not.toHaveBeenCalled();
  });
});
