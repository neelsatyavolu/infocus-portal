import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() }));

vi.mock("@/src/lib/prisma", () => ({
  prisma: { meeting: { updateMany: mocks.updateMany, findUnique: mocks.findUnique, update: mocks.update } }
}));

import { sealMeetingKey } from "@/src/lib/meetings/key-crypto";
import { ensureMeetingKey, rotateMeetingKey } from "@/src/server/meetings-keys";

const SECRET = "test-app-auth-secret";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_AUTH_SECRET", SECRET);
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ensureMeetingKey", () => {
  it("only mints a key for a meeting that is not over", async () => {
    mocks.findUnique.mockResolvedValue({ keyCiphertext: sealMeetingKey(Buffer.alloc(32, 7), SECRET), keyEpoch: 0 });
    const key = await ensureMeetingKey("m1");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", keyCiphertext: null, status: { in: ["SCHEDULED", "LIVE"] } },
      data: { keyCiphertext: expect.stringMatching(/^v1\./) }
    });
    expect(Buffer.from(key.key, "base64url").equals(Buffer.alloc(32, 7))).toBe(true);
  });

  it("fails when an ended meeting has no key (nothing minted)", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({ keyCiphertext: null, keyEpoch: 0 });
    await expect(ensureMeetingKey("m1")).rejects.toThrow();
  });
});

describe("rotateMeetingKey", () => {
  it("stores a new sealed key and returns the incremented epoch", async () => {
    mocks.update.mockResolvedValue({ keyEpoch: 4 });
    const key = await rotateMeetingKey("m1");
    expect(key.epoch).toBe(4);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { keyCiphertext: expect.stringMatching(/^v1\./), keyEpoch: { increment: 1 } } })
    );
  });
});
