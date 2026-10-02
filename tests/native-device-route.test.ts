import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  real: vi.fn(),
  allowed: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  apnsConfigured: vi.fn(),
  push: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({ getRealSessionUser: mocks.real }));
vi.mock("@/src/lib/platform-admin", () => ({ isEmailAllowedToUsePlatform: mocks.allowed }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { nativePushDevice: { upsert: mocks.upsert, deleteMany: mocks.deleteMany } } }));
vi.mock("@/src/lib/apns", () => ({ isApnsConfigured: mocks.apnsConfigured }));
vi.mock("@/src/lib/native-push", () => ({ sendNativePushToUserIds: mocks.push }));
vi.mock("@/src/lib/hosts", () => ({ mainAppOrigin: () => "https://portal.example.edu" }));

import { DELETE, POST } from "@/app/api/push/native-device/route";
import { POST as sendTest } from "@/app/api/push/native-device/test/route";

const token = "AB".repeat(32);
const user = { userId: "real-user", email: "sage@example.edu", name: "Sage", imageUrl: null, provider: "google", providerUserId: "g1" };

function request(method: string, body: unknown) {
  return new Request("https://portal.example.edu/api/push/native-device", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.real.mockResolvedValue(user);
  mocks.allowed.mockResolvedValue(true);
  mocks.upsert.mockResolvedValue({});
  mocks.deleteMany.mockResolvedValue({ count: 1 });
  mocks.apnsConfigured.mockReturnValue(true);
  mocks.push.mockResolvedValue({ sent: 1, failed: 0 });
});

describe("POST /api/push/native-device", () => {
  it("registers the Mac under the real signed-in user (never a View as target), lowercasing the token", async () => {
    const response = await POST(request("POST", { token, environment: "production", appVersion: "2.0.0" }));
    expect(response.status).toBe(201);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { token: token.toLowerCase() },
      update: { userId: "real-user", environment: "production", appVersion: "2.0.0" },
      create: { userId: "real-user", token: token.toLowerCase(), environment: "production", appVersion: "2.0.0" }
    });
  });

  it("requires a session and Portal access", async () => {
    mocks.real.mockResolvedValueOnce(null);
    expect((await POST(request("POST", { token, environment: "production" }))).status).toBe(401);
    mocks.allowed.mockResolvedValueOnce(false);
    expect((await POST(request("POST", { token, environment: "production" }))).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects malformed tokens and environments", async () => {
    expect((await POST(request("POST", { token: "not-hex", environment: "production" }))).status).toBe(400);
    expect((await POST(request("POST", { token, environment: "staging" }))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/push/native-device", () => {
  it("only removes the caller's own token", async () => {
    const response = await DELETE(request("DELETE", { token }));
    expect(await response.json()).toEqual({ data: { removed: true } });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: "real-user", token: token.toLowerCase() } });
  });
});

describe("POST /api/push/native-device/test", () => {
  it("notifies the caller's Macs", async () => {
    const response = await sendTest();
    expect(response.status).toBe(200);
    expect(mocks.push).toHaveBeenCalledWith(["real-user"], {
      title: "InFocus Portal",
      body: "Mac notifications are working.",
      url: "https://portal.example.edu/settings"
    });
  });

  it("explains when the server or this Mac isn't set up", async () => {
    mocks.apnsConfigured.mockReturnValueOnce(false);
    expect((await sendTest()).status).toBe(400);
    mocks.push.mockResolvedValueOnce({ sent: 0, failed: 0 });
    const none = await sendTest();
    expect((await none.json()).error.message).toContain("No Mac is registered");
    mocks.push.mockResolvedValueOnce({ sent: 0, failed: 1 });
    expect((await sendTest()).status).toBe(502);
  });
});
