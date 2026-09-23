import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStationToken, parseStationToken, getEquipmentStationCookieMeta } from "@/src/lib/equipment-kiosk";
import { createAppSessionToken } from "@/src/lib/auth";
import { parseAppSessionToken } from "@/src/lib/auth-edge";
beforeEach(() => { vi.stubEnv("APP_AUTH_SECRET", "station-test-secret"); vi.useFakeTimers(); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("separate hourly equipment session", () => {
  it("expires exactly one hour after manager sign-in", () => {
    const token = createStationToken("manager");
    expect(parseStationToken(token)?.userId).toBe("manager");
    vi.advanceTimersByTime(3599999);
    expect(parseStationToken(token)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(parseStationToken(token)).toBeNull();
  });
  it("rejects tampering and legacy passcode tokens", () => {
    expect(parseStationToken(createStationToken("manager") + "x")).toBeNull();
    expect(parseStationToken("a".repeat(64))).toBeNull();
  });
  it("cannot exchange equipment and main Portal tokens", async () => {
    const portal = createAppSessionToken({ userId: "manager", email: "m@example.com", name: null, imageUrl: null, provider: "google", providerUserId: "123" }, true);
    expect(parseStationToken(portal)).toBeNull();
    expect(await parseAppSessionToken(createStationToken("manager"))).toBeNull();
  });
  it("fails closed without a signing secret", () => {
    const token = createStationToken("manager");
    vi.stubEnv("APP_AUTH_SECRET", "");
    expect(parseStationToken(token)).toBeNull();
    expect(() => createStationToken("manager")).toThrow();
  });
  it("uses a one-hour HttpOnly cookie across production equipment/callback hosts", () => {
    expect(getEquipmentStationCookieMeta("equipment.infocuspaly.com")).toMatchObject({ maxAge: 3600, domain: ".infocuspaly.com", httpOnly: true, sameSite: "lax" });
    expect(getEquipmentStationCookieMeta("localhost:3000")).not.toHaveProperty("domain");
  });
});
