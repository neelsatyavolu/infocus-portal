import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), access: vi.fn(), allowed: vi.fn(), manager: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { user: { findUnique: m.user } } }));
vi.mock("@/src/lib/platform-admin", () => ({ getPlatformAccess: m.access, isEmailAllowedToUsePlatform: m.allowed }));
vi.mock("@/src/server/equipment-access", () => ({ requireEquipmentManagerAccess: m.manager }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: m.get, set: m.set }) }));
import { createStationToken, EQUIPMENT_STATION_COOKIE_NAME } from "@/src/lib/equipment-kiosk";
import { requireEquipmentStation } from "@/src/server/equipment-station";
import { GET as status } from "@/app/api/equipment/kiosk/session/route";
import { POST as lock } from "@/app/api/equipment/kiosk/lock/route";
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.stubEnv("APP_AUTH_SECRET", "equipment-test");
  m.user.mockResolvedValue({ id: "manager", email: "m@example.com", name: "Manager" });
  m.allowed.mockResolvedValue(true);
  m.access.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("equipment station access", () => {
  it("checks current manager access for a valid Google station session", async () => {
    expect(await requireEquipmentStation(createStationToken("manager"))).toMatchObject({ userId: "manager" });
    expect(m.manager).toHaveBeenCalledWith("manager", "ASSOCIATE_PRODUCER");
  });
  it("rejects an expired session before loading user data", async () => {
    const token = createStationToken("manager");
    vi.advanceTimersByTime(3600000);
    await expect(requireEquipmentStation(token)).rejects.toThrow("UNAUTHORIZED");
    expect(m.user).not.toHaveBeenCalled();
  });
  it("rejects access revoked since sign-in", async () => {
    m.manager.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(requireEquipmentStation(createStationToken("manager"))).rejects.toThrow("FORBIDDEN");
  });
  it("rejects accounts removed from Portal", async () => {
    m.allowed.mockResolvedValue(false);
    await expect(requireEquipmentStation(createStationToken("manager"))).rejects.toThrow("FORBIDDEN");
  });
  it("reports a locked station when only a Portal cookie exists", async () => {
    m.get.mockImplementation((name) => name === "infocus_session" ? { value: "portal" } : undefined);
    expect(await (await status()).json()).toEqual({ data: { unlocked: false } });
    expect(m.user).not.toHaveBeenCalled();
  });
  it("reports remaining time without extending the session", async () => {
    m.get.mockReturnValue({ value: createStationToken("manager") });
    vi.advanceTimersByTime(120000);
    expect(await (await status()).json()).toEqual({ data: { unlocked: true, expiresAt: Date.now() + 3480000, remainingMs: 3480000 } });
    expect(m.set).not.toHaveBeenCalled();
  });
  it("manual locking clears only the equipment cookie with the same domain", async () => {
    expect((await lock(new Request("https://equipment.infocuspaly.com/api/equipment/kiosk/lock", { method: "POST" }))).status).toBe(200);
    expect(m.set).toHaveBeenCalledTimes(1);
    expect(m.set).toHaveBeenCalledWith(EQUIPMENT_STATION_COOKIE_NAME, "", expect.objectContaining({ maxAge: 0, domain: ".infocuspaly.com" }));
  });
});
