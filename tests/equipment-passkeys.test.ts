import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  findChallenge: vi.fn(), consume: vi.fn(), findCredential: vi.fn(), update: vi.fn(),
  verifyRegistration: vi.fn(), create: vi.fn(), findUser: vi.fn(), verify: vi.fn(), allowed: vi.fn(), access: vi.fn(), manager: vi.fn()
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  equipmentPasskeyChallenge: { findUnique: m.findChallenge, deleteMany: m.consume },
  equipmentPasskey: { findUnique: m.findCredential, updateMany: m.update, create: m.create },
  user: { findUnique: m.findUser }
} }));
vi.mock("@simplewebauthn/server", () => ({ verifyAuthenticationResponse: m.verify, verifyRegistrationResponse: m.verifyRegistration }));
vi.mock("@/src/lib/platform-admin", () => ({ isEmailAllowedToUsePlatform: m.allowed, getPlatformAccess: m.access }));
vi.mock("@/src/server/equipment-access", () => ({ requireEquipmentManagerAccess: m.manager }));
import { authenticateEquipmentPasskey, registerEquipmentPasskey, passkeyContext, consumePasskeyChallenge } from "@/src/server/equipment-passkeys";
const origin = "https://equipment.infocuspaly.com";
const response = { id: "cred", response: {} } as never;
describe("equipment passkeys", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.findChallenge.mockResolvedValue({ id: "nonce", challenge: "challenge", purpose: "unlock", origin, userId: null, expiresAt: new Date(Date.now() + 60000) });
    m.consume.mockResolvedValue({ count: 1 });
    m.findCredential.mockResolvedValue({ id: "cred", userId: "manager", publicKey: Buffer.from([1]), counter: 0n, user: { id: "manager", email: "manager@example.com" } });
    m.allowed.mockResolvedValue(true);
    m.access.mockResolvedValue({ role: null });
    m.verify.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });
    m.update.mockResolvedValue({ count: 1 });
  });
  it("saves a verified registration for the signed-in manager", async () => {
    m.findUser.mockResolvedValue({ id: "manager", email: "manager@example.com" });
    m.findChallenge.mockResolvedValue({ purpose: "register", origin, userId: "manager", challenge: "challenge", expiresAt: new Date(Date.now() + 60000) });
    m.verifyRegistration.mockResolvedValue({ verified: true, registrationInfo: { credential: { id: "cred", publicKey: new Uint8Array([1, 2]), counter: 0 } } });
    await registerEquipmentPasskey("manager", "nonce", { origin, rpID: "infocuspaly.com" }, {} as never, "My Mac");
    expect(m.verifyRegistration).toHaveBeenCalledWith(expect.objectContaining({ requireUserVerification: true, expectedRPID: "infocuspaly.com" }));
    expect(m.create).toHaveBeenCalledWith({ data: { id: "cred", userId: "manager", publicKey: Buffer.from([1, 2]), counter: 0n, label: "My Mac" } });
  });
  it("rejects a registration challenge belonging to a different account", async () => {
    m.findChallenge.mockResolvedValue({ purpose: "register", origin, userId: "other", expiresAt: new Date(Date.now() + 60000) });
    await expect(consumePasskeyChallenge("nonce", "register", origin, "manager")).rejects.toThrow("UNAUTHORIZED");
  });
  it("rejects challenges issued on another origin", async () => {
    await expect(consumePasskeyChallenge("nonce", "unlock", "https://infocuspaly.com")).rejects.toThrow("UNAUTHORIZED");
  });
  it("rejects a credential removed during verification", async () => {
    m.update.mockResolvedValue({ count: 0 });
    await expect(authenticateEquipmentPasskey("nonce", "unlock", { origin, rpID: "infocuspaly.com" }, response)).rejects.toThrow("UNAUTHORIZED");
  });
  it("only accepts approved origins and matching Origin headers", () => {
    expect(passkeyContext(new Request(origin, { headers: { origin } }))).toEqual({ origin, rpID: "infocuspaly.com" });
    expect(() => passkeyContext(new Request(origin, { headers: { origin: "https://evil.example" } }))).toThrow();
    expect(() => passkeyContext(new Request("https://evil.example", { headers: { origin: "https://evil.example" } }))).toThrow();
  });
  it("requires verified user presence and current manager access", async () => {
    await authenticateEquipmentPasskey("nonce", "unlock", { origin, rpID: "infocuspaly.com" }, response);
    expect(m.manager).toHaveBeenCalledWith("manager", null);
    expect(m.verify).toHaveBeenCalledWith(expect.objectContaining({ requireUserVerification: true, expectedChallenge: "challenge", expectedOrigin: origin }));
  });
  it("rejects removed managers before cryptographic verification", async () => {
    m.manager.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(authenticateEquipmentPasskey("nonce", "unlock", { origin, rpID: "infocuspaly.com" }, response)).rejects.toThrow("FORBIDDEN");
    expect(m.verify).not.toHaveBeenCalled();
  });
  it("rejects accounts removed from Portal", async () => {
    m.allowed.mockResolvedValue(false);
    await expect(authenticateEquipmentPasskey("nonce", "unlock", { origin, rpID: "infocuspaly.com" }, response)).rejects.toThrow("FORBIDDEN");
  });
  it.each(["login", "register"])("cannot reuse an unlock challenge for %s", async (purpose) => {
    await expect(consumePasskeyChallenge("nonce", purpose as "login", origin)).rejects.toThrow("UNAUTHORIZED");
  });
  it("rejects expired challenges", async () => {
    m.findChallenge.mockResolvedValue({ purpose: "unlock", origin, expiresAt: new Date(0) });
    await expect(consumePasskeyChallenge("nonce", "unlock", origin)).rejects.toThrow("UNAUTHORIZED");
  });
  it("atomically rejects replayed challenges", async () => {
    m.consume.mockResolvedValue({ count: 0 });
    await expect(consumePasskeyChallenge("nonce", "unlock", origin)).rejects.toThrow("UNAUTHORIZED");
  });
  it("rejects a failed signature", async () => {
    m.verify.mockResolvedValue({ verified: false });
    await expect(authenticateEquipmentPasskey("nonce", "unlock", { origin, rpID: "infocuspaly.com" }, response)).rejects.toThrow("UNAUTHORIZED");
    expect(m.update).not.toHaveBeenCalled();
  });
});
