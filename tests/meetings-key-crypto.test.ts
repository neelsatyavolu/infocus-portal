import { describe, expect, it } from "vitest";
import {
  MEETING_KEY_BYTES,
  createMeetingKey,
  meetingKeyToBase64Url,
  openMeetingKey,
  sealMeetingKey
} from "@/src/lib/meetings/key-crypto";

const SECRET = "test-app-auth-secret";

describe("meeting key crypto", () => {
  it("creates 32 random bytes", () => {
    const a = createMeetingKey();
    const b = createMeetingKey();
    expect(a).toHaveLength(MEETING_KEY_BYTES);
    expect(Buffer.compare(a, b)).not.toBe(0);
  });

  it("round-trips through AES-256-GCM", () => {
    const key = createMeetingKey();
    const sealed = sealMeetingKey(key, SECRET);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain(meetingKeyToBase64Url(key));
    expect(openMeetingKey(sealed, SECRET)?.equals(key)).toBe(true);
  });

  it("refuses the wrong secret, tampering and junk", () => {
    const sealed = sealMeetingKey(createMeetingKey(), SECRET);
    expect(openMeetingKey(sealed, "other-secret")).toBeNull();
    const parts = sealed.split(".");
    const flipped = parts[3][0] === "A" ? "B" : "A";
    expect(openMeetingKey([...parts.slice(0, 3), flipped + parts[3].slice(1)].join("."), SECRET)).toBeNull();
    expect(openMeetingKey("nope", SECRET)).toBeNull();
  });

  it("does not open values sealed for the YouTube credential (distinct derivation)", async () => {
    const { encryptRefreshToken } = await import("@/src/lib/youtube-credential-crypto");
    expect(openMeetingKey(encryptRefreshToken("x".repeat(32), SECRET), SECRET)).toBeNull();
  });

  it("encodes as unpadded base64url", () => {
    const encoded = meetingKeyToBase64Url(Buffer.alloc(32, 0xff));
    expect(encoded).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(encoded, "base64url")).toHaveLength(32);
  });
});
