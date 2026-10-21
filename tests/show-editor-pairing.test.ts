import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pairing: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  device: { findFirst: vi.fn() }
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: { showEditorPairing: mocks.pairing, showEditorDevice: mocks.device } }));

import { normalizePairingCode, PAIRING_CODE_ALPHABET } from "@/src/lib/show-editor";
import {
  applyCredentialAcks, createPairing, deliverCredentials, hashPairingCode, lookupPairing, pairingRateLimited,
  pairingStatuses, purgeStaleCiphertext, submitPairing
} from "@/src/server/show-editor-pairing";

const NOW = new Date("2026-10-20T22:00:00Z");
// A stand-in for the Mac's base64 X25519 key.
const KEY = Buffer.from("test-public-key").toString("base64");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

describe("show editor pairing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.device.findFirst.mockResolvedValue({ id: "laptop", name: "Abby's laptop", publicKey: KEY });
    mocks.pairing.create.mockResolvedValue({});
    mocks.pairing.updateMany.mockResolvedValue({ count: 1 });
    mocks.pairing.findMany.mockResolvedValue([]);
  });

  it("makes an 8-character code from the unambiguous alphabet and stores only its hash", async () => {
    vi.stubEnv("APP_BASE_URL", "https://portal.example.edu");
    const pairing = await createPairing({ userId: "u1", backend: "codex" }, NOW);
    expect(pairing.code).toMatch(/^[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{4}$/);
    const bare = normalizePairingCode(pairing.code)!;
    expect([...bare].every((char) => PAIRING_CODE_ALPHABET.includes(char))).toBe(true);
    expect(pairing.expiresAt).toBe(new Date(NOW.getTime() + 10 * 60_000).toISOString());
    const data = mocks.pairing.create.mock.calls[0][0].data;
    expect(data).toEqual({
      codeHash: sha(bare), backend: "codex", deviceId: "laptop", publicKey: KEY, createdById: "u1", expiresAt: new Date(NOW.getTime() + 10 * 60_000)
    });
    expect(mocks.device.findFirst).toHaveBeenCalledWith({ where: { active: true, revokedAt: null } });
    expect(pairing.deviceId).toBe("laptop");
    expect(JSON.stringify(data)).not.toContain(bare);
    expect(pairing.command).toBe(
      `uvx --from git+https://github.com/neelsatyavolu/infocus-editor infocus-editor connect codex --code ${pairing.code} --portal https://portal.example.edu`
    );
  });

  it("builds the command from SHOW_EDITOR_REPO_URL", async () => {
    vi.stubEnv("SHOW_EDITOR_REPO_URL", "https://github.com/example/editor-fork");
    vi.stubEnv("APP_BASE_URL", "https://portal.example.edu");
    const pairing = await createPairing({ userId: "u1", backend: "claude" }, NOW);
    expect(pairing.command).toContain("uvx --from git+https://github.com/example/editor-fork infocus-editor connect claude");
  });

  it("targets the chosen machine, and needs its public key", async () => {
    await createPairing({ userId: "u1", backend: "grok", deviceId: "team-mac" }, NOW);
    expect(mocks.device.findFirst).toHaveBeenLastCalledWith({ where: { id: "team-mac", revokedAt: null } });
    mocks.device.findFirst.mockResolvedValue({ id: "team-mac", name: "Team MacBook", publicKey: null });
    await expect(createPairing({ userId: "u1", backend: "grok", deviceId: "team-mac" }, NOW)).rejects.toMatchObject({ status: 409 });
    mocks.device.findFirst.mockResolvedValue(null);
    await expect(createPairing({ userId: "u1", backend: "grok" }, NOW)).rejects.toMatchObject({ status: 404 });
    expect(mocks.pairing.create).toHaveBeenCalledTimes(1);
  });

  it("hashes the code however it was typed", () => {
    expect(hashPairingCode("abcd-2345")).toBe(sha("ABCD2345"));
    expect(hashPairingCode("ABCD 2345")).toBe(sha("ABCD2345"));
    expect(hashPairingCode("ABCD-234")).toBeNull();
    expect(hashPairingCode("OOOO-1111")).toBeNull();
  });

  it("lookup returns the backend and key for a live code", async () => {
    const expiresAt = new Date(NOW.getTime() + 60_000);
    mocks.pairing.findUnique.mockResolvedValue({ backend: "claude", publicKey: KEY, expiresAt, submittedAt: null });
    expect(await lookupPairing("ABCD-2345", NOW)).toEqual({ backend: "claude", publicKey: KEY, expiresAt: expiresAt.toISOString() });
    expect(mocks.pairing.findUnique).toHaveBeenCalledWith({ where: { codeHash: sha("ABCD2345") } });
  });

  it("404 for an unknown, expired, used or malformed code", async () => {
    mocks.pairing.findUnique.mockResolvedValueOnce(null);
    await expect(lookupPairing("ABCD-2345", NOW)).rejects.toMatchObject({ status: 404 });
    mocks.pairing.findUnique.mockResolvedValueOnce({ backend: "claude", publicKey: KEY, expiresAt: new Date(NOW.getTime() - 1), submittedAt: null });
    await expect(lookupPairing("ABCD-2345", NOW)).rejects.toMatchObject({ status: 404 });
    mocks.pairing.findUnique.mockResolvedValueOnce({ backend: "claude", publicKey: KEY, expiresAt: new Date(NOW.getTime() + 60_000), submittedAt: NOW });
    await expect(lookupPairing("ABCD-2345", NOW)).rejects.toMatchObject({ status: 404 });
    await expect(lookupPairing("nope", NOW)).rejects.toMatchObject({ status: 404 });
  });

  it("a code can be submitted once, before it expires", async () => {
    await submitPairing("ABCD-2345", "c2VhbGVk", NOW);
    expect(mocks.pairing.updateMany).toHaveBeenCalledWith({
      where: { codeHash: sha("ABCD2345"), submittedAt: null, expiresAt: { gt: NOW } },
      data: { ciphertext: "c2VhbGVk", submittedAt: NOW }
    });
    mocks.pairing.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(submitPairing("ABCD-2345", "c2VhbGVk", NOW)).rejects.toMatchObject({ status: 404 });
  });

  it("refuses ciphertext over 65536 characters or not base64", async () => {
    await expect(submitPairing("ABCD-2345", "A".repeat(65_537), NOW)).rejects.toMatchObject({ status: 400 });
    await expect(submitPairing("ABCD-2345", "not base64!", NOW)).rejects.toMatchObject({ status: 400 });
    expect(mocks.pairing.updateMany).not.toHaveBeenCalled();
  });

  it("heartbeat delivers only credentials for that machine, sealed to its current key", async () => {
    mocks.pairing.findMany.mockResolvedValue([{ id: "p1", backend: "claude", ciphertext: "c2VhbGVk" }]);
    expect(await deliverCredentials("laptop", KEY, NOW)).toEqual([{ id: "p1", backend: "claude", ciphertext: "c2VhbGVk" }]);
    expect(mocks.pairing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { deviceId: "laptop", publicKey: KEY, submittedAt: { not: null }, ciphertext: { not: null }, ackOk: null }
    }));
    expect(mocks.pairing.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["p1"] } }, data: { deliveredAt: NOW } });
    mocks.pairing.findMany.mockClear();
    expect(await deliverCredentials("laptop", null, NOW)).toEqual([]);
    expect(mocks.pairing.findMany).not.toHaveBeenCalled();
  });

  it("acks record the result and clear the ciphertext", async () => {
    await applyCredentialAcks([{ id: "p1", ok: true }, { id: "p2", ok: false, error: "claude: token rejected" }], "laptop");
    expect(mocks.pairing.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", deviceId: "laptop" }, data: { ackOk: true, ackError: null, ciphertext: null }
    });
    expect(mocks.pairing.updateMany).toHaveBeenCalledWith({
      where: { id: "p2", deviceId: "laptop" }, data: { ackOk: false, ackError: "claude: token rejected", ciphertext: null }
    });
  });

  it("deletes ciphertext an hour after it was sent", async () => {
    await purgeStaleCiphertext(NOW);
    expect(mocks.pairing.updateMany).toHaveBeenCalledWith({
      where: { ciphertext: { not: null }, submittedAt: { lt: new Date(NOW.getTime() - 60 * 60_000) } },
      data: { ciphertext: null }
    });
  });

  it("reports the latest code per machine and backend", async () => {
    const later = new Date(NOW.getTime() + 60_000).toISOString();
    mocks.pairing.findMany.mockResolvedValue([
      { deviceId: "laptop", backend: "claude", expiresAt: new Date(later), submittedAt: null, ciphertext: null, ackOk: null, ackError: null },
      { deviceId: "laptop", backend: "claude", expiresAt: new Date(NOW.getTime() - 60_000), submittedAt: NOW, ciphertext: null, ackOk: true, ackError: null },
      { deviceId: "laptop", backend: "codex", expiresAt: new Date(later), submittedAt: NOW, ciphertext: "x", ackOk: null, ackError: null },
      { deviceId: "laptop", backend: "grok", expiresAt: new Date(later), submittedAt: NOW, ciphertext: null, ackOk: false, ackError: "grok: not signed in" }
    ]);
    expect(await pairingStatuses(NOW)).toEqual([
      { deviceId: "laptop", backend: "claude", status: "waiting", error: null, expiresAt: later },
      { deviceId: "laptop", backend: "codex", status: "sent", error: null, expiresAt: later },
      { deviceId: "laptop", backend: "grok", status: "failed", error: "grok: not signed in", expiresAt: later }
    ]);
  });

  it("keeps each machine's sign-in status apart", async () => {
    const later = new Date(NOW.getTime() + 60_000);
    mocks.pairing.findMany.mockResolvedValue([
      { deviceId: "team-mac", backend: "claude", expiresAt: later, submittedAt: null, ciphertext: null, ackOk: null, ackError: null },
      { deviceId: "laptop", backend: "claude", expiresAt: later, submittedAt: NOW, ciphertext: null, ackOk: true, ackError: null }
    ]);
    expect((await pairingStatuses(NOW)).map((entry) => [entry.deviceId, entry.backend, entry.status])).toEqual([
      ["team-mac", "claude", "waiting"], ["laptop", "claude", "connected"]
    ]);
  });

  it("an unused expired code and an uninstalled sign-in show as failed", async () => {
    const past = new Date(NOW.getTime() - 60_000);
    mocks.pairing.findMany.mockResolvedValue([
      { deviceId: "laptop", backend: "claude", expiresAt: past, submittedAt: null, ciphertext: null, ackOk: null, ackError: null },
      { deviceId: "laptop", backend: "codex", expiresAt: past, submittedAt: new Date(NOW.getTime() - 2 * 3600_000), ciphertext: null, ackOk: null, ackError: null }
    ]);
    const statuses = await pairingStatuses(NOW);
    expect(statuses.map((entry) => [entry.backend, entry.status])).toEqual([["claude", "failed"], ["codex", "failed"]]);
    expect(statuses[0].error).toMatch(/expired/);
    expect(statuses[1].error).toMatch(/hour/);
  });

  it("rate-limits code guesses per address", () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}`;
    for (let index = 0; index < 20; index += 1) expect(pairingRateLimited(ip, NOW)).toBe(false);
    expect(pairingRateLimited(ip, NOW)).toBe(true);
    expect(pairingRateLimited(ip, new Date(NOW.getTime() + 11 * 60_000))).toBe(false);
  });
});
