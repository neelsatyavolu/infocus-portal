import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  get: vi.fn(), set: vi.fn(), real: vi.fn(), effective: vi.fn(), manager: vi.fn(),
  authenticate: vi.fn(), register: vi.fn(), options: vi.fn(), remove: vi.fn(), setting: vi.fn(), token: vi.fn()
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: m.get, set: m.set }) }));
vi.mock("@/src/lib/auth", () => ({ getRealSessionUser: m.real, getSessionUser: m.effective,
  createAppSessionToken: m.token, getAppSessionCookieMeta: () => ({ httpOnly: true }) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { equipmentPasskey: { deleteMany: m.remove }, equipmentSetting: { findFirst: m.setting } } }));
vi.mock("@/src/lib/rate-limit", () => ({ getRequestKey: () => "key", limitByKey: () => ({ allowed: true }) }));
vi.mock("@/src/server/equipment-passkeys", () => ({
  passkeyContext: () => ({ origin: "https://equipment.infocuspaly.com", rpID: "infocuspaly.com" }),
  requirePasskeyManager: m.manager, registrationOptions: m.options, registerEquipmentPasskey: m.register,
  authenticateEquipmentPasskey: m.authenticate, authenticationOptions: m.options
}));
import { POST } from "@/app/api/equipment/public/passkeys/route";
import { APP_SESSION_COOKIE_NAME } from "@/src/lib/auth-cookies";
const credential = { id: "cred", rawId: "cred", type: "public-key", response: { clientDataJSON: "data", authenticatorData: "data", signature: "signature" }, clientExtensionResults: {} };
function request(body: unknown) {
  return new Request("https://equipment.infocuspaly.com/api/equipment/public/passkeys", { method: "POST", body: JSON.stringify(body) });
}
describe("equipment passkey route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.get.mockReturnValue({ value: "challenge" });
    m.real.mockResolvedValue({ userId: "manager" });
    m.effective.mockResolvedValue({ userId: "manager" });
    m.authenticate.mockResolvedValue({ id: "manager", email: "m@example.com", name: "Manager", imageUrl: null });
    m.setting.mockResolvedValue({ checkoutPasscodeHash: "hash" });
    m.token.mockReturnValue("session");
  });
  it("rejects passkey checkout unlock in favor of separate Google sign-in", async () => {
    expect((await POST(request({ action: "authenticate", purpose: "unlock", response: credential }))).status).toBe(400);
    expect(m.authenticate).not.toHaveBeenCalled();
    expect(m.set).not.toHaveBeenCalled();
  });
  it("creates a passkey login session without unlocking checkout", async () => {
    expect((await POST(request({ action: "authenticate", purpose: "login", response: credential }))).status).toBe(200);
    expect(m.token).toHaveBeenCalledWith(expect.objectContaining({ provider: "passkey", userId: "manager" }), false);
    expect(m.set).toHaveBeenCalledWith(APP_SESSION_COOKIE_NAME, "session", expect.any(Object));
    expect(m.setting).not.toHaveBeenCalled();
  });
  it("requires a challenge cookie", async () => {
    m.get.mockReturnValue(undefined);
    expect((await POST(request({ action: "authenticate", purpose: "login", response: credential }))).status).toBe(401);
    expect(m.authenticate).not.toHaveBeenCalled();
  });
  it("requires sign-in before registration", async () => {
    m.real.mockResolvedValue(null);
    expect((await POST(request({ action: "register-options" }))).status).toBe(401);
    expect(m.options).not.toHaveBeenCalled();
  });
  it("blocks registering a credential while viewing another account", async () => {
    m.effective.mockResolvedValue({ userId: "someone-else" });
    expect((await POST(request({ action: "register-options" }))).status).toBe(400);
    expect(m.options).not.toHaveBeenCalled();
  });
  it("scopes removal to the authenticated manager", async () => {
    expect((await POST(request({ action: "remove", id: "cred" }))).status).toBe(200);
    expect(m.remove).toHaveBeenCalledWith({ where: { id: "cred", userId: "manager" } });
  });
  it("rejects failed authentication without issuing access cookies", async () => {
    m.authenticate.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await POST(request({ action: "authenticate", purpose: "login", response: credential }))).status).toBe(401);
    expect(m.token).not.toHaveBeenCalled();
  });

});
