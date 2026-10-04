import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  participantUpdateMany: vi.fn(),
  markLive: vi.fn(),
  endMeeting: vi.fn(),
  knock: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    meeting: { findUnique: mocks.findUnique, update: mocks.update },
    meetingParticipant: { updateMany: mocks.participantUpdateMany }
  }
}));
vi.mock("@/src/server/meetings-join", () => ({ markMeetingLive: mocks.markLive }));
vi.mock("@/src/server/meetings-moderation", () => ({ endMeeting: mocks.endMeeting }));
vi.mock("@/src/server/meetings-notify", () => ({ notifyMeetingKnock: mocks.knock }));

import { POST as notesPost } from "@/app/api/service/meetings/[id]/notes/route";
import { POST as roomPost } from "@/app/api/service/meetings/[id]/room/route";
import { signMeetingInternalToken } from "@/src/lib/meetings/room-token";

const ROOM_SECRET = "r".repeat(40);
const DRIVE_TOKEN = "drive-service-token-for-tests";
const params = { params: Promise.resolve({ id: "m1" }) };
const meeting = { id: "m1", title: "Producer meeting", createdById: "creator" };

function post(path: string, body: unknown, token?: string) {
  return new Request(`https://portal.example.edu${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MEETING_ROOM_SECRET", ROOM_SECRET);
  vi.stubEnv("DRIVE_SERVICE_TOKEN", DRIVE_TOKEN);
  mocks.findUnique.mockResolvedValue(meeting);
  mocks.update.mockResolvedValue({});
  mocks.markLive.mockResolvedValue(true);
  mocks.endMeeting.mockResolvedValue({ ended: true });
  mocks.knock.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/service/meetings/[id]/room", () => {
  it("rejects a missing, forged, wrong-side or expired token", async () => {
    expect((await roomPost(post("/api/service/meetings/m1/room", { t: "started" }), params)).status).toBe(401);
    const forged = await signMeetingInternalToken("room", "m1", "x".repeat(40));
    expect((await roomPost(post("/api/service/meetings/m1/room", { t: "started" }, forged), params)).status).toBe(401);
    const portalSide = await signMeetingInternalToken("portal", "m1", ROOM_SECRET);
    expect((await roomPost(post("/api/service/meetings/m1/room", { t: "started" }, portalSide), params)).status).toBe(401);
    const expired = await signMeetingInternalToken("room", "m1", ROOM_SECRET, Date.now() - 10 * 60_000);
    expect((await roomPost(post("/api/service/meetings/m1/room", { t: "started" }, expired), params)).status).toBe(401);
    const otherMeeting = await signMeetingInternalToken("room", "m2", ROOM_SECRET);
    expect((await roomPost(post("/api/service/meetings/m1/room", { t: "started" }, otherMeeting), params)).status).toBe(401);
    expect(mocks.markLive).not.toHaveBeenCalled();
  });

  it("is unavailable when meetings are not configured", async () => {
    vi.stubEnv("MEETING_ROOM_SECRET", "");
    const token = await signMeetingInternalToken("room", "m1", ROOM_SECRET);
    expect((await roomPost(post("/api/service/meetings/m1/room", { t: "started" }, token), params)).status).toBe(503);
  });

  it("marks the meeting live on started, pushes hosts on knock, ends on empty", async () => {
    const token = await signMeetingInternalToken("room", "m1", ROOM_SECRET);
    expect((await roomPost(post("/api/service/meetings/m1/room", { t: "started" }, token), params)).status).toBe(200);
    expect(mocks.markLive).toHaveBeenCalledWith("m1");

    await roomPost(post("/api/service/meetings/m1/room", { t: "knock", uid: "u2", name: "Otto" }, token), params);
    expect(mocks.knock).toHaveBeenCalledWith(meeting, { uid: "u2", name: "Otto" });

    await roomPost(post("/api/service/meetings/m1/room", { t: "empty" }, token), params);
    expect(mocks.endMeeting).toHaveBeenCalledWith("m1");
  });

  it("404s an unknown meeting and 400s a bad report", async () => {
    const token = await signMeetingInternalToken("room", "m1", ROOM_SECRET);
    expect((await roomPost(post("/api/service/meetings/m1/room", { t: "nope" }, token), params)).status).toBe(400);
    mocks.findUnique.mockResolvedValueOnce(null);
    expect((await roomPost(post("/api/service/meetings/m1/room", { t: "started" }, token), params)).status).toBe(404);
  });
});

describe("hostPromoted report", () => {
  it("marks that admitted participant as a promoted host", async () => {
    mocks.participantUpdateMany.mockResolvedValue({ count: 1 });
    const token = await signMeetingInternalToken("room", "m1", ROOM_SECRET);
    const response = await roomPost(post("/api/service/meetings/m1/room", { t: "hostPromoted", uid: "u-abby" }, token), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ promoted: true });
    expect(mocks.participantUpdateMany).toHaveBeenCalledWith({
      where: { meetingId: "m1", userId: "u-abby", state: "ADMITTED" },
      data: { promotedHost: true }
    });
  });

  it("does nothing for someone who isn't admitted (removed, never joined)", async () => {
    mocks.participantUpdateMany.mockResolvedValue({ count: 0 });
    const token = await signMeetingInternalToken("room", "m1", ROOM_SECRET);
    const response = await roomPost(post("/api/service/meetings/m1/room", { t: "hostPromoted", uid: "u-gone" }, token), params);
    expect((await response.json()).data).toEqual({ promoted: false });
  });

  it("needs the room's token like every report", async () => {
    expect((await roomPost(post("/api/service/meetings/m1/room", { t: "hostPromoted", uid: "u-abby" }), params)).status).toBe(401);
    expect(mocks.participantUpdateMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/service/meetings/[id]/notes", () => {
  it("needs the Drive service token", async () => {
    const body = { status: "READY" };
    expect((await notesPost(post("/api/service/meetings/m1/notes", body), params)).status).toBe(401);
    expect((await notesPost(post("/api/service/meetings/m1/notes", body, "wrong"), params)).status).toBe(401);
    vi.stubEnv("DRIVE_SERVICE_TOKEN", "");
    expect((await notesPost(post("/api/service/meetings/m1/notes", body, DRIVE_TOKEN), params)).status).toBe(503);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("stores the status, summary and Drive folder", async () => {
    const response = await notesPost(
      post(
        "/api/service/meetings/m1/notes",
        { status: "READY", summaryMarkdown: "## Summary", drivePath: "Meetings/2026-10-04 2115 Producer meeting" },
        DRIVE_TOKEN
      ),
      params
    );
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { notesStatus: "READY", notesSummary: "## Summary", notesDrivePath: "Meetings/2026-10-04 2115 Producer meeting" }
    });
  });

  it("only touches the status on a progress update and rejects unknown statuses", async () => {
    await notesPost(post("/api/service/meetings/m1/notes", { status: "PROCESSING" }, DRIVE_TOKEN), params);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { notesStatus: "PROCESSING" } });
    expect((await notesPost(post("/api/service/meetings/m1/notes", { status: "NONE" }, DRIVE_TOKEN), params)).status).toBe(400);
  });
});
