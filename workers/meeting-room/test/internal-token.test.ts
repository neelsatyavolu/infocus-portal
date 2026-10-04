import { describe, expect, it } from "vitest";
import { signMeetingInternalToken, verifyMeetingInternalToken } from "../../../src/lib/meetings/room-token";

const SECRET = "test-secret-not-real-0123456789abcdef";

describe("internal tokens are bound to one meeting", () => {
  it("verifies only for the signed meeting id and side", async () => {
    const token = await signMeetingInternalToken("portal", "m1", SECRET);
    expect(await verifyMeetingInternalToken(token, SECRET, "portal", "m1")).not.toBeNull();
    expect(await verifyMeetingInternalToken(token, SECRET, "portal", "m2")).toBeNull();
    expect(await verifyMeetingInternalToken(token, SECRET, "room", "m1")).toBeNull();
  });
});
