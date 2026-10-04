import { describe, expect, it } from "vitest";
import {
  signMeetingInternalToken,
  signMeetingToken,
  verifyMeetingInternalToken,
  verifyMeetingRoomToken,
  type MeetingRoomTokenPayload
} from "@/src/lib/meetings/room-token";

const SECRET = "test-meeting-secret";
const NOW = 1_800_000_000_000;

function ticket(overrides: Partial<MeetingRoomTokenPayload> = {}): MeetingRoomTokenPayload {
  return { v: 1, kind: "room", mid: "m1", uid: "u1", name: "Abby", role: "member", adm: true, iat: NOW, exp: NOW + 60_000, ...overrides };
}

describe("meeting room tokens", () => {
  it("round-trips a room ticket", async () => {
    const token = await signMeetingToken(ticket(), SECRET);
    await expect(verifyMeetingRoomToken(token, SECRET, NOW)).resolves.toMatchObject({ mid: "m1", uid: "u1", adm: true });
  });

  it("rejects a wrong secret, tampering and expiry", async () => {
    const token = await signMeetingToken(ticket(), SECRET);
    await expect(verifyMeetingRoomToken(token, "other", NOW)).resolves.toBeNull();
    const [body, sig] = token.split(".");
    await expect(verifyMeetingRoomToken(`${body}x.${sig}`, SECRET, NOW)).resolves.toBeNull();
    await expect(verifyMeetingRoomToken(token, SECRET, NOW + 60_000)).resolves.toBeNull();
  });

  it("keeps room tickets and internal tokens apart", async () => {
    const internal = await signMeetingInternalToken("portal", "m1", SECRET, NOW);
    await expect(verifyMeetingRoomToken(internal, SECRET, NOW)).resolves.toBeNull();
    await expect(verifyMeetingInternalToken(internal, SECRET, "portal", "m1", NOW)).resolves.not.toBeNull();
    await expect(verifyMeetingInternalToken(internal, SECRET, "portal", "m2", NOW)).resolves.toBeNull();
    await expect(verifyMeetingInternalToken(internal, SECRET, "room", "m1", NOW)).resolves.toBeNull();
    const room = await signMeetingToken(ticket(), SECRET);
    await expect(verifyMeetingInternalToken(room, SECRET, "portal", "m1", NOW)).resolves.toBeNull();
  });
});
