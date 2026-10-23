import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() }));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    showEditorCommand: { findMany: mocks.findMany, create: mocks.create, deleteMany: mocks.deleteMany },
    showEditorDevice: { findFirst: mocks.findFirst }
  }
}));

import { queueEditorCommand, recentEditorCommands } from "@/src/server/show-editor-commands";

const notShell = { NOT: { kind: { startsWith: "shell:" } } };

describe("editor commands", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never lists the super admin's remote commands, nor results finished over 6 hours ago", async () => {
    mocks.findMany.mockResolvedValue([]);
    const now = new Date("2026-10-22T23:00:00Z");
    await recentEditorCommands(["d1"], now);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        deviceId: { in: ["d1"] }, ...notShell,
        OR: [{ finishedAt: null }, { finishedAt: { gte: new Date("2026-10-22T17:00:00Z") } }]
      }
    }));
  });

  it("trims a machine's history without touching remote commands", async () => {
    mocks.findFirst.mockResolvedValue({ id: "d1" });
    mocks.create.mockResolvedValue({ id: "c1", deviceId: "d1", kind: "doctor", status: "PENDING", output: null, createdAt: new Date(), finishedAt: null });
    mocks.findMany.mockResolvedValue([]);
    await queueEditorCommand({ userId: "u1", deviceId: "d1", kind: "doctor" });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deviceId: "d1", ...notShell } }));
  });
});
