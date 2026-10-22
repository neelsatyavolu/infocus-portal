import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: { findUnique: vi.fn(), upsert: vi.fn() },
  command: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
  device: { findFirst: vi.fn() }
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: { showEditorSettings: mocks.settings, showEditorCommand: mocks.command, showEditorDevice: mocks.device } }));

import { DEFAULT_SHOW_EDITOR_HOUSE_RULES } from "@/src/lib/show-editor-house-rules";
import {
  applyCommandAcks, queueEditorCommand, recentEditorCommands, takePendingCommands
} from "@/src/server/show-editor-commands";
import { effectiveEditorSettings, loadEditorSettings, saveEditorSettings } from "@/src/server/show-editor-settings";

const NOW = new Date("2026-10-20T22:00:00Z");

function row(overrides: Record<string, unknown> = {}) {
  return { id: "editor", autoStart: null, autoPublish: null, targetVersion: null, agentOrder: null, houseRules: null, updatedById: null, updatedAt: NOW, ...overrides } as never;
}

describe("editor settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("falls back to the env vars only while a setting is null", () => {
    vi.stubEnv("SHOW_EDITOR_AUTO_START", "1");
    vi.stubEnv("SHOW_EDITOR_AUTO_PUBLISH", "1");
    vi.stubEnv("SHOW_EDITOR_TARGET_VERSION", " v0.2.0 ");
    expect(effectiveEditorSettings(null)).toEqual({
      autoStart: true, autoPublish: true, targetVersion: "v0.2.0", agentOrder: ["claude", "codex", "grok"], houseRules: null, updatedAt: null
    });
    expect(effectiveEditorSettings(row({ autoStart: false, autoPublish: false, targetVersion: "v0.3.1" }))).toMatchObject({
      autoStart: false, autoPublish: false, targetVersion: "v0.3.1"
    });
  });

  it("defaults are off with no env and no row", async () => {
    mocks.settings.findUnique.mockResolvedValue(null);
    expect(await loadEditorSettings()).toMatchObject({ autoStart: false, autoPublish: false, targetVersion: null });
  });

  it("keeps a valid saved agent order and ignores junk", () => {
    expect(effectiveEditorSettings(row({ agentOrder: ["codex", "claude"] })).agentOrder).toEqual(["codex", "claude"]);
    expect(effectiveEditorSettings(row({ agentOrder: ["gemini"] })).agentOrder).toEqual(["claude", "codex", "grok"]);
  });

  it("saves only the fields given", async () => {
    mocks.settings.upsert.mockImplementation(async ({ create }) => ({ ...(row() as object), ...create }));
    await saveEditorSettings({ agentOrder: ["grok", "claude"], targetVersion: null }, "u1");
    expect(mocks.settings.upsert).toHaveBeenCalledWith({
      where: { id: "editor" },
      update: { updatedById: "u1", agentOrder: ["grok", "claude"], targetVersion: null },
      create: { id: "editor", updatedById: "u1", agentOrder: ["grok", "claude"], targetVersion: null }
    });
  });

  it("the default house rules are the 17 generic rules, with no names", () => {
    const rules = DEFAULT_SHOW_EDITOR_HOUSE_RULES.split("\n").filter((line) => /^\d+\. /.test(line));
    expect(rules).toHaveLength(17);
    expect(DEFAULT_SHOW_EDITOR_HOUSE_RULES).toContain("−6 dBFS");
    expect(DEFAULT_SHOW_EDITOR_HOUSE_RULES.length).toBeLessThan(20_000);
  });
});

describe("editor commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.command.create.mockImplementation(async ({ data }) => ({ id: "c1", status: "PENDING", output: null, createdAt: NOW, finishedAt: null, ...data }));
    mocks.command.findMany.mockResolvedValue([]);
    mocks.command.updateMany.mockResolvedValue({ count: 1 });
    mocks.device.findFirst.mockResolvedValue({ id: "laptop" });
  });

  it("queues a command for one machine and keeps only its last 20", async () => {
    mocks.command.findMany.mockResolvedValueOnce([{ id: "old1" }, { id: "old2" }]);
    expect(await queueEditorCommand({ userId: "u1", deviceId: "laptop", kind: "doctor" })).toMatchObject({ id: "c1", deviceId: "laptop", kind: "doctor", status: "PENDING" });
    expect(mocks.command.create).toHaveBeenCalledWith({ data: { deviceId: "laptop", kind: "doctor", requestedById: "u1" } });
    expect(mocks.command.findMany).toHaveBeenCalledWith({ where: { deviceId: "laptop", NOT: { kind: { startsWith: "shell:" } } }, orderBy: { createdAt: "desc" }, skip: 20, select: { id: true } });
    expect(mocks.command.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["old1", "old2"] } } });
  });

  it("refuses a command for an unlinked machine", async () => {
    mocks.device.findFirst.mockResolvedValue(null);
    await expect(queueEditorCommand({ userId: "u1", deviceId: "gone", kind: "logs" })).rejects.toMatchObject({ status: 404 });
    expect(mocks.command.create).not.toHaveBeenCalled();
  });

  it("hands a machine only its own pending commands, once", async () => {
    mocks.command.findMany.mockResolvedValueOnce([{ id: "c1", kind: "logs" }]);
    expect(await takePendingCommands("laptop", NOW)).toEqual([{ id: "c1", kind: "logs" }]);
    expect(mocks.command.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deviceId: "laptop", status: "PENDING" } }));
    expect(mocks.command.updateMany).toHaveBeenLastCalledWith({ where: { id: { in: ["c1"] }, status: "PENDING" }, data: { status: "SENT", sentAt: NOW } });
  });

  it("closes a command the machine never answered within an hour, before handing out new ones", async () => {
    mocks.command.findMany.mockResolvedValueOnce([]);
    await takePendingCommands("laptop", NOW);
    expect(mocks.command.updateMany).toHaveBeenCalledWith({
      where: { deviceId: "laptop", status: "SENT", sentAt: { lt: new Date(NOW.getTime() - 60 * 60_000) } },
      data: { status: "FAILED", ok: false, output: expect.stringContaining("No answer from the machine"), finishedAt: NOW }
    });
  });

  it("stores the Mac's result, capped at 4000 characters", async () => {
    await applyCommandAcks([{ id: "c1", ok: true, output: "x".repeat(5000) }, { id: "c2", ok: false }], "laptop", NOW);
    expect(mocks.command.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "c1", deviceId: "laptop" }, data: { status: "DONE", ok: true, finishedAt: NOW, output: "x".repeat(4000) }
    });
    expect(mocks.command.updateMany.mock.calls[1][0].data).toMatchObject({ status: "FAILED", ok: false, output: null });
  });

  it("lists the history newest first", async () => {
    mocks.command.findMany.mockResolvedValueOnce([{ id: "c2", deviceId: "laptop", kind: "logs", status: "DONE", output: "last lines", createdAt: NOW, finishedAt: NOW }]);
    expect(await recentEditorCommands(["laptop", "team-mac"])).toEqual([
      { id: "c2", deviceId: "laptop", kind: "logs", status: "DONE", output: "last lines", createdAt: NOW.toISOString(), finishedAt: NOW.toISOString() }
    ]);
    expect(mocks.command.findMany).toHaveBeenCalledWith({ where: { deviceId: { in: ["laptop", "team-mac"] }, NOT: { kind: { startsWith: "shell:" } } }, orderBy: { createdAt: "desc" }, take: 40 });
    expect(await recentEditorCommands([])).toEqual([]);
  });
});
