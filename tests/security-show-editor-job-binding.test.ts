import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashEditorToken } from "@/src/lib/show-editor-auth";

const OTTO_TOKEN = "otto-machine-token-0001";
const SAGE_TOKEN = "sage-machine-token-0002";

const mocks = vi.hoisted(() => ({
  job: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  deviceFindFirst: vi.fn(),
  upload: vi.fn(),
  attach: vi.fn(),
  notify: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    showEditJob: mocks.job,
    showEditorDevice: { findFirst: mocks.deviceFindFirst, upsert: vi.fn() }
  }
}));
vi.mock("@/src/server/show-editor-drive", () => ({
  listShowRecordings: vi.fn(),
  mintEditorDownload: vi.fn(),
  mintEditorUpload: mocks.upload,
  driveFileSize: vi.fn(),
  editorDriveBaseUrl: () => "https://drive.example.org"
}));
vi.mock("@/src/server/show-publishing", async (original) => ({
  ...(await original<typeof import("@/src/server/show-publishing")>()),
  attachEditedShow: mocks.attach
}));
vi.mock("@/src/server/show-editor-notify", () => ({ notifyShowEdit: mocks.notify, runShowEditAutoStart: vi.fn() }));

import { POST as progress } from "@/app/api/service/show-editor/jobs/[id]/progress/route";
import { POST as uploadTargets } from "@/app/api/service/show-editor/jobs/[id]/upload-targets/route";
import { POST as complete } from "@/app/api/service/show-editor/jobs/[id]/complete/route";
import { POST as failRoute } from "@/app/api/service/show-editor/jobs/[id]/fail/route";

const OUTPUT = "Package Storage/Shows/2026-10-21/InFocus Show 2026-10-21-abc.mp4";

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job1", showDate: "2026-10-21", status: "RUNNING", deviceId: "dev-otto", pendingFix: null, version: 1,
    outputNasPath: OUTPUT, posterNasPath: "Package Storage/Shows/2026-10-21/InFocus Show 2026-10-21-abc.poster.jpg",
    checks: null, cancelRequested: false, claimedAt: new Date("2026-10-20T21:00:00Z"), createdById: "u-abby",
    ...overrides
  };
}

function post(token: string, body: unknown = {}) {
  return new Request("https://portal.example.edu/api/service/show-editor/jobs/job1/x", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

const params = () => ({ params: Promise.resolve({ id: "job1" }) });
const completeBody = { outputNasPath: OUTPUT, decisions: [], checks: {}, needsReview: false, costUsd: 1, agentSessionId: "s" };

describe("show editor job routes only answer the claiming machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SHOW_EDITOR_TOKEN", "");
    const devices: Record<string, string> = {
      [hashEditorToken(OTTO_TOKEN)]: "dev-otto",
      [hashEditorToken(SAGE_TOKEN)]: "dev-sage"
    };
    mocks.deviceFindFirst.mockImplementation(async ({ where }: { where: { tokenHash: string } }) =>
      devices[where.tokenHash] ? { id: devices[where.tokenHash] } : null
    );
    mocks.job.findUnique.mockResolvedValue(job());
    mocks.upload.mockResolvedValue({ path: "p", token: "rw.x" });
  });

  it("another linked machine gets 404 on every job route and changes nothing", async () => {
    const responses = await Promise.all([
      progress(post(SAGE_TOKEN, { stage: "render", message: "Rendering" }), params()),
      uploadTargets(post(SAGE_TOKEN), params()),
      complete(post(SAGE_TOKEN, completeBody), params()),
      failRoute(post(SAGE_TOKEN, { error: "x", cancelled: false }), params())
    ]);
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.attach).not.toHaveBeenCalled();
    expect(mocks.job.update).not.toHaveBeenCalled();
  });

  it("the claiming machine still gets its upload targets", async () => {
    const response = await uploadTargets(post(OTTO_TOKEN), params());
    expect(response.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledTimes(3);
  });

  it("nobody can fail a queued edit that no machine has claimed", async () => {
    mocks.job.findUnique.mockResolvedValue(job({ status: "QUEUED", deviceId: null }));
    for (const token of [OTTO_TOKEN, SAGE_TOKEN]) {
      expect((await failRoute(post(token, { error: "x", cancelled: false }), params())).status).toBe(404);
    }
    expect(mocks.job.update).not.toHaveBeenCalled();
  });

  it("a queued fix can be failed by the machine it waits for, and no other", async () => {
    mocks.job.findUnique.mockResolvedValue(job({ status: "QUEUED", pendingFix: "Fix the card" }));
    expect((await failRoute(post(SAGE_TOKEN, { error: "x", cancelled: false }), params())).status).toBe(404);
    expect(mocks.job.update).not.toHaveBeenCalled();
  });
});
