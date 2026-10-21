import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ device: vi.fn(), legacy: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { showEditorDevice: { findFirst: mocks.device, upsert: mocks.legacy } } }));

import { editorCaller, isShowEditorRequest } from "@/src/lib/show-editor-auth";

const DEVICE_TOKEN = "device-token-for-tests-0123456789";

function request(authorization?: string) {
  return new Request("https://portal.example.edu/api/service/show-editor/claim", {
    method: "POST",
    headers: authorization ? { authorization } : {}
  });
}

describe("show editor auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.device.mockResolvedValue(null);
    mocks.legacy.mockResolvedValue({ id: "legacy", revokedAt: null });
  });

  it("the exact legacy bearer counts as the machine named legacy", async () => {
    expect(await editorCaller(request("Bearer editor-secret"), "editor-secret")).toEqual({ deviceId: "legacy" });
    expect(mocks.legacy).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "legacy" }, create: { id: "legacy", name: "legacy", linkedById: "env" }
    }));
    expect(mocks.device).not.toHaveBeenCalled();
  });

  it("an unlinked legacy machine gets nothing", async () => {
    mocks.legacy.mockResolvedValue({ id: "legacy", revokedAt: new Date() });
    expect(await isShowEditorRequest(request("Bearer editor-secret"), "editor-secret")).toBe(false);
  });

  it("rejects a missing secret and a missing header", async () => {
    expect(await isShowEditorRequest(request("Bearer "), undefined)).toBe(false);
    expect(await isShowEditorRequest(request("Bearer "), "")).toBe(false);
    expect(await isShowEditorRequest(request(), "editor-secret")).toBe(false);
    expect(mocks.device).not.toHaveBeenCalled();
  });

  it("rejects CRON_SECRET", async () => {
    process.env.CRON_SECRET = "cron-secret-value-for-tests";
    expect(await isShowEditorRequest(request("Bearer cron-secret-value-for-tests"), "editor-secret")).toBe(false);
  });

  it("rejects a different-length token", async () => {
    expect(await isShowEditorRequest(request("Bearer editor-secre"), "editor-secret")).toBe(false);
    expect(await isShowEditorRequest(request("Bearer editor-secret2"), "editor-secret")).toBe(false);
  });

  it("accepts the linked Mac's device token by its sha256", async () => {
    mocks.device.mockResolvedValue({ id: "device1" });
    expect(await editorCaller(request(`Bearer ${DEVICE_TOKEN}`), undefined)).toEqual({ deviceId: "device1" });
    expect(mocks.device).toHaveBeenCalledWith({
      where: { tokenHash: createHash("sha256").update(DEVICE_TOKEN).digest("hex"), revokedAt: null }, select: { id: true }
    });
  });

  it("rejects a revoked or unknown device token", async () => {
    mocks.device.mockResolvedValue(null);
    expect(await isShowEditorRequest(request(`Bearer ${DEVICE_TOKEN}`), "editor-secret")).toBe(false);
  });
});
