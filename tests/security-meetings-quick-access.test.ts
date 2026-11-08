import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = { state: string; removedAt: Date | null; promotedHost: boolean };

const mocks = vi.hoisted(() => ({
  meetingFindUnique: vi.fn(),
  meetingFindUniqueOrThrow: vi.fn(),
  meetingUpdateMany: vi.fn(),
  ensureKey: vi.fn(),
  usage: vi.fn(),
  row: null as Row | null
}));

// A one-row participant table, so repeated joins see the state earlier joins wrote.
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    meeting: {
      findUnique: mocks.meetingFindUnique,
      findUniqueOrThrow: mocks.meetingFindUniqueOrThrow,
      updateMany: mocks.meetingUpdateMany
    },
    meetingParticipant: {
      findUnique: vi.fn(async () => (mocks.row ? { ...mocks.row } : null)),
      create: vi.fn(async ({ data }: { data: { state: string } }) => {
        mocks.row = { state: data.state, removedAt: null, promotedHost: false };
        return {};
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { state?: string }; data: { state?: string } }) => {
        if (!mocks.row || (where.state && where.state !== mocks.row.state)) return { count: 0 };
        mocks.row = { ...mocks.row, ...(data.state ? { state: data.state } : {}) };
        return { count: 1 };
      })
    }
  }
}));
vi.mock("@/src/lib/auth", () => ({ requireUserId: vi.fn(), syncUserProfile: vi.fn() }));
vi.mock("@/src/server/meetings-keys", () => ({
  ensureMeetingKey: mocks.ensureKey,
  rotateMeetingKey: vi.fn(),
  readMeetingKey: vi.fn()
}));
vi.mock("@/src/server/meetings-scribe", () => ({
  startMeetingScribe: vi.fn(),
  rekeyMeetingScribe: vi.fn(),
  stopMeetingScribe: vi.fn()
}));
vi.mock("@/src/server/meetings-usage", () => ({ checkMeetingUsage: mocks.usage, MEETING_USAGE_LIMIT_MESSAGE: "over limit" }));

import { joinMeeting } from "@/src/server/meetings-join";
import { decideAdmission } from "@/src/server/meetings-rules";

const NOW = new Date("2026-10-05T04:15:00.000Z");
const producer = { userId: "u-abby", name: "Abby", role: "ASSOCIATE_PRODUCER" as const };

beforeEach(() => {
  vi.stubEnv("MEETING_ROOM_SECRET", "s".repeat(40));
  vi.stubEnv("MEETING_ROOM_URL", "https://meet.example.edu/");
  mocks.meetingFindUnique.mockResolvedValue({
    id: "m1",
    status: "LIVE",
    startsAt: NOW,
    access: "OPEN",
    createdById: "u-otto",
    inviteeUserIds: [],
    quickAccess: true,
    endedReason: null,
    endedAt: null,
    roomGeneration: 0
  });
  mocks.meetingFindUniqueOrThrow.mockResolvedValue({
    id: "m1",
    title: "Producer meeting",
    startsAt: NOW,
    durationMinutes: 60,
    status: "LIVE",
    access: "OPEN",
    inviteeUserIds: [],
    seriesKey: null,
    createdById: "u-otto",
    notesEnabled: false,
    quickAccess: true,
    notesStatus: "NONE",
    createdBy: null,
    _count: { participants: 1 }
  });
  mocks.meetingUpdateMany.mockResolvedValue({ count: 1 });
  mocks.ensureKey.mockResolvedValue({ key: "a".repeat(43), epoch: 0 });
  mocks.usage.mockResolvedValue("allowed");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mocks.row = null;
});

describe("quick access after a removal or denial", () => {
  it("a removed producer stays in the lobby however many times they join", async () => {
    mocks.row = { state: "REMOVED", removedAt: new Date("2026-10-05T04:10:00.000Z"), promotedHost: false };
    for (let join = 0; join < 3; join += 1) {
      expect((await joinMeeting(producer, "m1", NOW)).state).toBe("WAITING");
    }
    expect(mocks.row?.state).toBe("WAITING");
    expect(mocks.ensureKey).not.toHaveBeenCalled();
  });

  it("a denied producer stays in the lobby however many times they join", async () => {
    mocks.row = { state: "DENIED", removedAt: null, promotedHost: false };
    for (let join = 0; join < 3; join += 1) {
      expect((await joinMeeting(producer, "m1", NOW)).state).toBe("WAITING");
    }
    expect(mocks.row?.state).toBe("DENIED");
    expect(mocks.ensureKey).not.toHaveBeenCalled();
  });

  it("still lets a new producer straight in", async () => {
    expect((await joinMeeting(producer, "m1", NOW)).state).toBe("ADMITTED");
    expect((await joinMeeting(producer, "m1", NOW)).state).toBe("ADMITTED");
  });
});

describe("decideAdmission excluded", () => {
  it("keeps quick access off for someone a host removed, even once they're WAITING", () => {
    expect(decideAdmission({ isHost: false, quickAccess: true, previous: "WAITING", excluded: true })).toBe("WAITING");
    expect(decideAdmission({ isHost: false, quickAccess: true, previous: "ADMITTED", excluded: true })).toBe("ADMITTED");
    expect(decideAdmission({ isHost: true, quickAccess: true, previous: "WAITING", excluded: true })).toBe("ADMITTED");
  });
});
