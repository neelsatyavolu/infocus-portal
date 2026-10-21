import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  device: vi.fn(), start: vi.fn(), poll: vi.fn(), heartbeat: vi.fn(), claim: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: { showEditorDevice: { findFirst: mocks.device, upsert: async () => ({ id: "legacy", revokedAt: null }) } } }));
vi.mock("@/src/server/show-editor-link", () => ({ startEditorLink: mocks.start, pollEditorLink: mocks.poll }));
vi.mock("@/src/server/show-editor", async (original) => ({
  ...await original<typeof import("@/src/server/show-editor")>(),
  recordHeartbeat: mocks.heartbeat,
  claimNextShowEdit: mocks.claim
}));

import { POST as linkStart } from "@/app/api/service/show-editor/link/route";
import { POST as linkPoll } from "@/app/api/service/show-editor/link/poll/route";
import { POST as heartbeat } from "@/app/api/service/show-editor/heartbeat/route";
import { POST as claim } from "@/app/api/service/show-editor/claim/route";
import middleware from "@/middleware";

const DEVICE_TOKEN = "ifed_device-token-for-tests-0123456789abcdef";
let address = 0;

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  address += 1;
  return new Request(`https://portal.example.edu/api/service/show-editor/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": `192.0.2.${address % 250}`, ...headers },
    body: JSON.stringify(body)
  });
}

describe("editor link routes and device-token auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SHOW_EDITOR_TOKEN", "");
    mocks.device.mockResolvedValue(null);
  });

  it("link start needs no auth and passes the device name through", async () => {
    const started = { deviceCode: "d", userCode: "ABCD-2345", verificationUrl: "https://portal.example.edu/show-roles?link=ABCD-2345", expiresAt: "x", interval: 5 };
    mocks.start.mockResolvedValue(started);
    const response = await linkStart(post("link", { deviceName: "Studio MacBook Pro" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: started });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.start).toHaveBeenCalledWith({ deviceName: "Studio MacBook Pro" });
    expect((await linkStart(post("link", { deviceName: "" }))).status).toBe(400);
    expect((await linkStart(post("link", { deviceName: "x".repeat(81) }))).status).toBe(400);
  });

  it("link poll needs no auth and returns the token reply as is", async () => {
    mocks.poll.mockResolvedValue({ status: "approved", token: DEVICE_TOKEN });
    const response = await linkPoll(post("link/poll", { deviceCode: "secret-device-code-0123456789" }));
    expect(await response.json()).toEqual({ data: { status: "approved", token: DEVICE_TOKEN } });
    expect((await linkPoll(post("link/poll", { deviceCode: "short" }))).status).toBe(400);
  });

  it("link start is rate-limited per address", async () => {
    mocks.start.mockResolvedValue({});
    const statuses: number[] = [];
    for (let index = 0; index < 21; index += 1) {
      statuses.push((await linkStart(post("link", { deviceName: "Mac" }, { "cf-connecting-ip": "198.51.100.200" }))).status);
    }
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("link poll allows a full 15 minutes of 5-second polls, then limits", async () => {
    mocks.poll.mockResolvedValue({ status: "pending" });
    const statuses: number[] = [];
    for (let index = 0; index < 241; index += 1) {
      statuses.push((await linkPoll(post("link/poll", { deviceCode: "secret-device-code-0123456789" }, { "cf-connecting-ip": "198.51.100.201" }))).status);
    }
    expect(statuses.slice(0, 180).every((status) => status === 200)).toBe(true);
    expect(statuses[240]).toBe(429);
  });

  it("editor routes accept the linked Mac's device token and record which device called", async () => {
    mocks.device.mockResolvedValue({ id: "device1" });
    mocks.claim.mockResolvedValue(null);
    expect((await claim(post("claim", {}, { authorization: `Bearer ${DEVICE_TOKEN}` }))).status).toBe(200);
    expect(mocks.claim).toHaveBeenCalledWith("device1");
    expect(mocks.device).toHaveBeenCalledWith({
      where: { tokenHash: createHash("sha256").update(DEVICE_TOKEN).digest("hex"), revokedAt: null }, select: { id: true }
    });
    mocks.heartbeat.mockResolvedValue({ cancelJobIds: [] });
    await heartbeat(post("heartbeat", { version: "v0.3.1", busy: false, health: { ok: true, problems: [] } }, { authorization: `Bearer ${DEVICE_TOKEN}` }));
    expect(mocks.heartbeat).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "device1" }));
  });

  it("a revoked (unlinked) device gets 401", async () => {
    mocks.device.mockResolvedValue(null);
    expect((await heartbeat(post("heartbeat", { version: "v0.3.1", busy: false, health: { ok: true, problems: [] } }, { authorization: `Bearer ${DEVICE_TOKEN}` }))).status).toBe(401);
    expect((await claim(post("claim", {}, { authorization: `Bearer ${DEVICE_TOKEN}` }))).status).toBe(401);
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });

  it("the legacy SHOW_EDITOR_TOKEN still works", async () => {
    vi.stubEnv("SHOW_EDITOR_TOKEN", "legacy-editor-token-for-tests");
    mocks.claim.mockResolvedValue(null);
    expect((await claim(post("claim", {}, { authorization: "Bearer legacy-editor-token-for-tests" }))).status).toBe(200);
    expect(mocks.claim).toHaveBeenCalledWith("legacy");
    expect(mocks.device).not.toHaveBeenCalled();
  });

  it("middleware lets the Mac's signed-out link calls through", async () => {
    for (const path of ["link", "link/poll"]) {
      const response = await middleware(new NextRequest(`https://portal.example.edu/api/service/show-editor/${path}`, { method: "POST" }));
      expect(response.status).not.toBe(401);
      expect(response.headers.get("location")).toBeNull();
    }
  });
});
