import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  meeting: { findUnique: vi.fn() },
  meetingParticipant: { findMany: vi.fn(), updateMany: vi.fn() }
}));
const room = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/server/meetings-access", () => ({
  assertCanSeeMeeting: vi.fn(),
  isMeetingHostOrPromoted: vi.fn(async () => true)
}));
vi.mock("@/src/server/meetings-keys", () => ({ readMeetingKey: vi.fn(), rotateMeetingKey: vi.fn() }));
vi.mock("@/src/server/meetings-room-client", () => ({ sendMeetingRoomEvent: room.send }));
vi.mock("@/src/server/meetings-scribe", () => ({ rekeyMeetingScribe: vi.fn(), stopMeetingScribe: vi.fn() }));

import { admitAllWaiting } from "@/src/server/meetings-moderation";

beforeEach(() => {
  vi.clearAllMocks();
  db.meeting.findUnique.mockResolvedValue({ id: "m", status: "LIVE", access: "OPEN", createdById: "host", inviteeUserIds: [], notesEnabled: false });
  db.meetingParticipant.updateMany.mockResolvedValue({ count: 12 });
});

describe("admitAllWaiting", () => {
  it("sends admitted events five at a time and logs the ones that failed", async () => {
    db.meetingParticipant.findMany.mockResolvedValue(Array.from({ length: 12 }, (_, i) => ({ userId: `u${i}` })));
    let inFlight = 0;
    let peak = 0;
    room.send.mockImplementation(async (_meetingId: string, event: { uid: string }) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return event.uid !== "u7";
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await admitAllWaiting({ id: "host" } as never, "m");

    expect(result).toEqual({ admitted: 12 });
    expect(room.send).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(5);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("Admit all"), expect.objectContaining({ failed: 1, of: 12 }));
    errors.mockRestore();
  });
});
