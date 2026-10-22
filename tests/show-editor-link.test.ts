import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  link: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  device: { create: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  transaction: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: {
  showEditorLink: mocks.link,
  showEditorDevice: mocks.device,
  $transaction: mocks.transaction
} }));

import {
  activateEditorDevice, decideEditorLink, describeEditorLink, listEditorDevices, pollEditorLink, revokeEditorDevice, startEditorLink
} from "@/src/server/show-editor-link";

const NOW = new Date("2026-10-20T22:00:00Z");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const LATER = new Date(NOW.getTime() + 5 * 60_000);

function waiting(overrides: Record<string, unknown> = {}) {
  return { id: "link1", userCode: "ABCD2345", deviceName: "Studio MacBook Pro", expiresAt: LATER, approvedById: null, token: null, deniedAt: null, ...overrides };
}

describe("editor linking (device code)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.link.deleteMany.mockResolvedValue({ count: 1 });
    mocks.link.create.mockResolvedValue({});
    mocks.transaction.mockResolvedValue([]);
    mocks.device.count.mockResolvedValue(1);
  });

  it("start stores only the device code's hash and returns a 15-minute link to the Editing tab", async () => {
    vi.stubEnv("APP_BASE_URL", "https://portal.example.edu");
    const link = await startEditorLink({ deviceName: "Studio MacBook Pro" }, NOW);
    expect(link.deviceCode.length).toBeGreaterThanOrEqual(43);
    expect(link.userCode).toMatch(/^[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{4}$/);
    expect(link).toMatchObject({
      verificationUrl: `https://portal.example.edu/editing?link=${link.userCode}`,
      expiresAt: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
      interval: 5
    });
    const data = mocks.link.create.mock.calls[0][0].data;
    expect(data).toEqual({
      deviceCodeHash: sha(link.deviceCode), userCode: link.userCode.replace("-", ""), deviceName: "Studio MacBook Pro",
      expiresAt: new Date(NOW.getTime() + 15 * 60_000)
    });
    expect(JSON.stringify(data)).not.toContain(link.deviceCode);
    expect(mocks.link.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: NOW } } });
  });

  it("poll is pending until a producer decides", async () => {
    mocks.link.findUnique.mockResolvedValue(waiting());
    expect(await pollEditorLink({ deviceCode: "secret-device-code-0123456789" }, NOW)).toEqual({ status: "pending" });
    expect(mocks.link.findUnique).toHaveBeenCalledWith({ where: { deviceCodeHash: sha("secret-device-code-0123456789") } });
  });

  it("the token is returned exactly once, then the link row is gone", async () => {
    mocks.link.findUnique.mockResolvedValueOnce(waiting({ token: "ifed_token", approvedById: "u1" }));
    mocks.link.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await pollEditorLink({ deviceCode: "secret-device-code-0123456789" }, NOW)).toEqual({ status: "approved", token: "ifed_token" });
    expect(mocks.link.deleteMany).toHaveBeenCalledWith({ where: { id: "link1", token: { not: null } } });

    // A racing second poll that read the row before it was deleted loses the delete and gets nothing.
    mocks.link.findUnique.mockResolvedValueOnce(waiting({ token: "ifed_token", approvedById: "u1" }));
    mocks.link.deleteMany.mockResolvedValueOnce({ count: 0 });
    expect(await pollEditorLink({ deviceCode: "secret-device-code-0123456789" }, NOW)).toEqual({ status: "expired" });

    mocks.link.findUnique.mockResolvedValueOnce(null);
    expect(await pollEditorLink({ deviceCode: "secret-device-code-0123456789" }, NOW)).toEqual({ status: "expired" });
  });

  it("an expired or denied link says so and is removed", async () => {
    mocks.link.findUnique.mockResolvedValueOnce(waiting({ expiresAt: new Date(NOW.getTime() - 1) }));
    expect(await pollEditorLink({ deviceCode: "secret-device-code-0123456789" }, NOW)).toEqual({ status: "expired" });
    mocks.link.findUnique.mockResolvedValueOnce(waiting({ deniedAt: NOW }));
    expect(await pollEditorLink({ deviceCode: "secret-device-code-0123456789" }, NOW)).toEqual({ status: "denied" });
    expect(mocks.link.deleteMany).toHaveBeenCalledWith({ where: { id: "link1" } });
  });

  it("the confirm screen names the waiting Mac, and nothing for a bad or used code", async () => {
    mocks.link.findUnique.mockResolvedValueOnce(waiting());
    expect(await describeEditorLink("abcd-2345", NOW)).toEqual({ userCode: "ABCD-2345", deviceName: "Studio MacBook Pro", expiresAt: LATER.toISOString() });
    expect(mocks.link.findUnique).toHaveBeenCalledWith({ where: { userCode: "ABCD2345" } });
    mocks.link.findUnique.mockResolvedValueOnce(waiting({ approvedById: "u1", token: "t" }));
    expect(await describeEditorLink("ABCD-2345", NOW)).toBeNull();
    expect(await describeEditorLink("nope", NOW)).toBeNull();
  });

  it("approving keeps other machines linked, makes the new one active and stores only the token's hash", async () => {
    mocks.link.findUnique.mockResolvedValue(waiting());
    const result = await decideEditorLink({ userId: "u1", userCode: "ABCD-2345", approve: true }, NOW);
    expect(result).toMatchObject({ linked: true, deviceName: "Studio MacBook Pro", active: true });
    // Only "active" is switched off on the others; nobody is revoked.
    expect(mocks.device.updateMany).toHaveBeenCalledWith({ where: { active: true }, data: { active: false } });
    expect(mocks.device.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.anything() }) }));
    const created = mocks.device.create.mock.calls[0][0].data;
    const update = mocks.link.update.mock.calls[0][0];
    expect(update.data.token).toMatch(/^ifed_[A-Za-z0-9_-]{43}$/);
    expect(created).toEqual({
      id: result.linked ? result.deviceId : "", name: "Studio MacBook Pro", tokenHash: sha(update.data.token), linkedById: "u1", linkedAt: NOW, active: true
    });
    expect(update).toMatchObject({ where: { id: "link1" }, data: { approvedById: "u1", expiresAt: new Date(NOW.getTime() + 15 * 60_000) } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("without 'make it active' the current machine stays active", async () => {
    mocks.link.findUnique.mockResolvedValue(waiting());
    expect(await decideEditorLink({ userId: "u1", userCode: "ABCD-2345", approve: true, activate: false }, NOW)).toMatchObject({ active: false });
    expect(mocks.device.updateMany).not.toHaveBeenCalled();
    expect(mocks.device.create.mock.calls[0][0].data.active).toBe(false);
  });

  it("the first linked machine becomes active by itself", async () => {
    mocks.device.count.mockResolvedValue(0);
    mocks.link.findUnique.mockResolvedValue(waiting());
    expect(await decideEditorLink({ userId: "u1", userCode: "ABCD-2345", approve: true, activate: false }, NOW)).toMatchObject({ active: true });
    expect(mocks.device.create.mock.calls[0][0].data.active).toBe(true);
  });

  it("turning a Mac down marks the link denied", async () => {
    mocks.link.findUnique.mockResolvedValue(waiting());
    expect(await decideEditorLink({ userId: "u1", userCode: "ABCD-2345", approve: false }, NOW)).toEqual({ linked: false });
    expect(mocks.link.update).toHaveBeenCalledWith({ where: { id: "link1" }, data: { deniedAt: NOW } });
    expect(mocks.device.create).not.toHaveBeenCalled();
  });

  it("404 for an unknown, expired or already-approved link code", async () => {
    mocks.link.findUnique.mockResolvedValueOnce(null);
    await expect(decideEditorLink({ userId: "u1", userCode: "ABCD-2345", approve: true }, NOW)).rejects.toMatchObject({ status: 404 });
    mocks.link.findUnique.mockResolvedValueOnce(waiting({ expiresAt: new Date(NOW.getTime() - 1) }));
    await expect(decideEditorLink({ userId: "u1", userCode: "ABCD-2345", approve: true }, NOW)).rejects.toMatchObject({ status: 404 });
    mocks.link.findUnique.mockResolvedValueOnce(waiting({ approvedById: "u2", token: "t" }));
    await expect(decideEditorLink({ userId: "u1", userCode: "ABCD-2345", approve: true }, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it("activation keeps exactly one active machine, in one transaction", async () => {
    mocks.device.findFirst.mockResolvedValue({ id: "team-mac" });
    expect(await activateEditorDevice("team-mac")).toEqual({ active: "team-mac" });
    expect(mocks.device.updateMany).toHaveBeenCalledWith({ where: { active: true, id: { not: "team-mac" } }, data: { active: false } });
    expect(mocks.device.update).toHaveBeenCalledWith({ where: { id: "team-mac" }, data: { active: true } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    mocks.device.findFirst.mockResolvedValue(null);
    await expect(activateEditorDevice("gone")).rejects.toMatchObject({ status: 404 });
  });

  it("unlinking revokes that machine and takes away its active badge", async () => {
    mocks.device.findFirst.mockResolvedValue({ id: "laptop" });
    expect(await revokeEditorDevice("laptop", NOW)).toEqual({ revoked: "laptop" });
    expect(mocks.device.update).toHaveBeenCalledWith({ where: { id: "laptop" }, data: { revokedAt: NOW, active: false } });
  });

  it("lists linked machines, active first, with their own state", async () => {
    mocks.device.findMany.mockResolvedValue([
      { id: "team-mac", name: "Team MacBook", kind: "dedicated", active: true, linkedAt: NOW, lastSeenAt: new Date(NOW.getTime() - 30_000),
        version: "v0.3.1", busy: false, health: { ok: true, problems: [] }, backends: [{ name: "claude", connected: true, detail: "" }] },
      { id: "laptop", name: "Abby's laptop", kind: "personal", active: false, linkedAt: NOW, lastSeenAt: null,
        version: null, busy: false, health: null, backends: null }
    ]);
    const devices = await listEditorDevices(NOW);
    expect(devices.map((device) => [device.id, device.active, device.online, device.kind])).toEqual([
      ["team-mac", true, true, "dedicated"], ["laptop", false, false, "personal"]
    ]);
    expect(devices[1].backends).toEqual([]);
    expect(mocks.device.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { revokedAt: null } }));
  });
});
