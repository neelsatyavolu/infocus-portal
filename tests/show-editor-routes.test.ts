import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  heartbeat: vi.fn(), claim: vi.fn(), progress: vi.fn(), targets: vi.fn(), complete: vi.fn(), fail: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: { showEditorDevice: {
  findFirst: async () => null,
  upsert: async () => ({ id: "legacy", revokedAt: null })
} } }));
vi.mock("@/src/server/show-editor", async (original) => ({
  ...await original<typeof import("@/src/server/show-editor")>(),
  recordHeartbeat: mocks.heartbeat,
  claimNextShowEdit: mocks.claim,
  reportShowEditProgress: mocks.progress,
  showEditUploadTargets: mocks.targets,
  completeShowEdit: mocks.complete,
  failShowEdit: mocks.fail
}));

import { POST as heartbeat } from "@/app/api/service/show-editor/heartbeat/route";
import { POST as claim } from "@/app/api/service/show-editor/claim/route";
import { POST as progress } from "@/app/api/service/show-editor/jobs/[id]/progress/route";
import { POST as uploadTargets } from "@/app/api/service/show-editor/jobs/[id]/upload-targets/route";
import { POST as complete } from "@/app/api/service/show-editor/jobs/[id]/complete/route";
import { POST as failRoute } from "@/app/api/service/show-editor/jobs/[id]/fail/route";
import { ShowEditError } from "@/src/server/show-editor";

const TOKEN = "editor-token-for-tests";

function post(body: unknown, token: string | null = TOKEN) {
  return new Request("https://portal.example.edu/api/service/show-editor/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
}

const params = { params: Promise.resolve({ id: "job1" }) };
const goodComplete = {
  outputNasPath: "Package Storage/Shows/2026-10-21/InFocus Show 2026-10-21-abc.mp4",
  decisions: [{ kind: "name", detail: "Used the roster spelling", flagged: false }],
  checks: { coversClean: true, loudness: [] }, needsReview: false, costUsd: 2.5, agentSessionId: "sess-1"
};

describe("show editor service routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SHOW_EDITOR_TOKEN", TOKEN);
  });

  it("401 without the editor token", async () => {
    const calls = [
      heartbeat(post({ version: "1", busy: false, health: { ok: true, problems: [] } }, null)),
      claim(post({}, "wrong")),
      progress(post({ stage: "analyze", message: "x" }, null), params),
      uploadTargets(post({}, null), params),
      complete(post(goodComplete, null), params),
      failRoute(post({ error: "x", cancelled: false }, null), params)
    ];
    for (const response of await Promise.all(calls)) expect(response.status).toBe(401);
    expect(mocks.heartbeat).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("401 when the Portal has no editor token configured", async () => {
    vi.stubEnv("SHOW_EDITOR_TOKEN", "");
    expect((await claim(post({}, ""))).status).toBe(401);
  });

  it("heartbeat passes health through and returns cancel requests", async () => {
    mocks.heartbeat.mockResolvedValue({ cancelJobIds: ["job1"], targetVersion: "v0.3.1" });
    const response = await heartbeat(post({ version: "0.1.0", busy: true, health: { ok: false, problems: ["The Mac is on battery."] } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { cancelJobIds: ["job1"], targetVersion: "v0.3.1" } });
    expect(mocks.heartbeat).toHaveBeenCalledWith({ version: "0.1.0", busy: true, health: { ok: false, problems: ["The Mac is on battery."] }, deviceId: "legacy" });
  });

  it("heartbeat rejects an oversized body", async () => {
    const problems = Array.from({ length: 21 }, (_, index) => `problem ${index}`);
    expect((await heartbeat(post({ version: "0.1.0", busy: false, health: { ok: false, problems } }))).status).toBe(400);
    expect((await heartbeat(post({ version: "x".repeat(41), busy: false, health: { ok: true, problems: [] } }))).status).toBe(400);
  });

  it("claim returns null when the queue is empty", async () => {
    mocks.claim.mockResolvedValue(null);
    const response = await claim(post({}));
    expect(await response.json()).toEqual({ data: { job: null } });
  });

  it("claim responses carry tokens, so they are never cached", async () => {
    mocks.claim.mockResolvedValue({ kind: "edit", job: { id: "job1" }, brief: {}, downloads: [{ path: "Shows/a.mov", url: "https://drive/x?token=r.1.s", size: 1 }] });
    const response = await claim(post({}));
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).data.downloads[0].url).toContain("token=");
  });

  it("progress rejects an unknown stage and forwards a known one", async () => {
    expect((await progress(post({ stage: "dance", message: "x" }), params)).status).toBe(400);
    mocks.progress.mockResolvedValue({ cancel: true });
    const response = await progress(post({ stage: "render", message: "Rendering v1" }), params);
    expect(await response.json()).toEqual({ data: { cancel: true } });
    expect(mocks.progress).toHaveBeenCalledWith({ id: "job1", stage: "render", message: "Rendering v1" });
  });

  it("complete rejects an outputNasPath that differs from the brief", async () => {
    mocks.complete.mockRejectedValue(new ShowEditError("outputNasPath doesn't match this run's brief.", 409));
    const response = await complete(post(goodComplete), params);
    expect(response.status).toBe(409);
  });

  it("complete validates decisions and forwards the reply", async () => {
    const tooMany = Array.from({ length: 51 }, () => ({ kind: "x", detail: "y", flagged: false }));
    expect((await complete(post({ ...goodComplete, decisions: tooMany }), params)).status).toBe(400);
    expect((await complete(post({ ...goodComplete, costUsd: -1 }), params)).status).toBe(400);
    mocks.complete.mockResolvedValue({ ok: true });
    const response = await complete(post({ ...goodComplete, reply: "Changed the card." }), params);
    expect(await response.json()).toEqual({ data: { ok: true } });
    expect(mocks.complete).toHaveBeenCalledWith({ id: "job1", ...goodComplete, reply: "Changed the card." });
  });

  it("fail forwards the error and the cancelled flag", async () => {
    mocks.fail.mockResolvedValue({ ok: true });
    await failRoute(post({ error: "ffmpeg exited with an error", cancelled: false }), params);
    expect(mocks.fail).toHaveBeenCalledWith({ id: "job1", error: "ffmpeg exited with an error", cancelled: false });
  });

  it("upload targets are never cached", async () => {
    mocks.targets.mockResolvedValue({ driveBaseUrl: "https://drive", video: { path: "a", token: "rw" }, poster: { path: "b", token: "rw" } });
    const response = await uploadTargets(post({}), params);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("an unexpected failure is a 500 the Mac can retry, without internals", async () => {
    mocks.claim.mockRejectedValue(new Error("Drive mint-token failed: 503 upstream at 10.0.0.5"));
    const response = await claim(post({}));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("10.0.0.5");
  });
});
