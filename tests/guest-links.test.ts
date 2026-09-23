import { describe, expect, it } from "vitest";
import { generateGuestToken, hashPasscode, isGuestLinkActive, verifyPasscode } from "@/src/lib/guest-links";

describe("Guest link security", () => {
  it("creates unique tokens", () => {
    const a = generateGuestToken();
    const b = generateGuestToken();
    expect(a).not.toEqual(b);
  });

  it("verifies passcode hash", () => {
    const hash = hashPasscode("1234");
    expect(verifyPasscode("1234", hash)).toBe(true);
    expect(verifyPasscode("wrong", hash)).toBe(false);
  });

  it("evaluates active vs revoked/expired links", () => {
    expect(isGuestLinkActive({ revokedAt: null, expiresAt: null })).toBe(true);
    expect(isGuestLinkActive({ revokedAt: new Date(), expiresAt: null })).toBe(false);
    expect(isGuestLinkActive({ revokedAt: null, expiresAt: new Date(Date.now() - 1_000) })).toBe(false);
  });
});
