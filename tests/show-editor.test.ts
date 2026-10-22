import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  job: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  device: { update: vi.fn(), count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  publication: { findUnique: vi.fn() },
  rows: vi.fn(),
  story: vi.fn(),
  recordings: vi.fn(), download: vi.fn(), upload: vi.fn(), size: vi.fn(),
  attach: vi.fn(), confirm: vi.fn(), pubState: vi.fn(),
  notify: vi.fn(), autoStart: vi.fn(),
  acks: vi.fn(), purge: vi.fn(), deliver: vi.fn(), pairings: vi.fn(),
  settings: { findUnique: vi.fn(), upsert: vi.fn() },
  commandAcks: vi.fn(), takeCommands: vi.fn(), recentCommands: vi.fn(),
  activate: vi.fn(), devices: vi.fn(), revoke: vi.fn(), mint: vi.fn(), roster: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: {
  showEditJob: mocks.job,
  showEditorDevice: mocks.device,
  showPublication: mocks.publication,
  showEditorSettings: mocks.settings,
  packageProgressRow: { findMany: mocks.rows }
} }));
vi.mock("@/src/server/show-story", () => ({ loadShowStory: mocks.story }));
vi.mock("@/src/server/show-editor-roster", () => ({ classRoster: mocks.roster }));
vi.mock("@/src/lib/nas-storage", async (original) => ({
  ...await original<typeof import("@/src/lib/nas-storage")>(),
  nasMintDownloadUrl: mocks.mint
}));
vi.mock("@/src/server/show-editor-drive", () => ({
  listShowRecordings: mocks.recordings,
  mintEditorDownload: mocks.download,
  mintEditorUpload: mocks.upload,
  driveFileSize: mocks.size,
  editorDriveBaseUrl: () => "https://drive.example.org"
}));
vi.mock("@/src/server/show-publishing", async (original) => ({
  ...await original<typeof import("@/src/server/show-publishing")>(),
  attachEditedShow: mocks.attach,
  confirmShowPublication: mocks.confirm,
  showPublicationState: mocks.pubState
}));
vi.mock("@/src/server/show-editor-pairing", () => ({
  applyCredentialAcks: mocks.acks, purgeStaleCiphertext: mocks.purge, deliverCredentials: mocks.deliver, pairingStatuses: mocks.pairings
}));
vi.mock("@/src/server/show-editor-commands", () => ({
  applyCommandAcks: mocks.commandAcks, takePendingCommands: mocks.takeCommands, recentEditorCommands: mocks.recentCommands
}));
vi.mock("@/src/server/show-editor-link", () => ({
  activateEditorDevice: mocks.activate, listEditorDevices: mocks.devices, revokeEditorDevice: mocks.revoke
}));
vi.mock("@/src/server/show-editor-notify", () => ({
  notifyShowEdit: mocks.notify,
  runShowEditAutoStart: mocks.autoStart
}));

import {
  approveShowEdit, scheduleWithDefaults, unlinkEditorDevice, cancelShowEdit, claimNextShowEdit, completeShowEdit, failShowEdit, recordHeartbeat, redoShowEdit,
  reportShowEditProgress, requestShowFix, showEditState, showEditUploadTargets, startShowEdit
} from "@/src/server/show-editor";
import { ShowUploadError } from "@/src/server/show-publishing";

const NOW = new Date("2026-10-20T22:00:00Z");
const SHOW = "2026-10-21";
const SRC = "Shows/InFocus 10-20.mov";

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job1", showDate: SHOW, sourcePaths: [SRC], status: "QUEUED", stage: null, message: null, note: null,
    outputNasPath: null, posterNasPath: null, decisions: null, checks: null, needsReview: false, costUsd: null,
    attempt: 0, error: null, createdById: "u1", cancelRequested: false, pendingFix: null, rememberFix: false,
    agentSessionId: null, conversation: null, version: 1, claimedAt: null, heartbeatAt: null, finishedAt: null,
    createdAt: new Date("2026-10-20T21:00:00Z"), updatedAt: NOW,
    ...overrides
  };
}

const recording = { path: SRC, name: "InFocus 10-20.mov", size: 345_000_000, modifiedAt: "2026-10-20T18:00:00.000Z", stable: true };

describe("show editor jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.publication.findUnique.mockResolvedValue(null);
    mocks.job.findFirst.mockResolvedValue(null);
    mocks.job.findMany.mockResolvedValue([]);
    mocks.job.updateMany.mockResolvedValue({ count: 1 });
    mocks.job.create.mockImplementation(async ({ data }) => job(data));
    mocks.job.update.mockImplementation(async ({ data }) => job(data));
    mocks.recordings.mockResolvedValue([recording]);
    mocks.story.mockResolvedValue({ date: SHOW, anchors: ["Abby Ames", "Otto Ortiz"], announcements: ["Math Club meets after school."], packages: [] });
    mocks.rows.mockResolvedValue([]);
    mocks.roster.mockResolvedValue(["Abby Ames", "Otto Ortiz", "Sage Stone"]);
    mocks.download.mockImplementation(async (path: string) => `https://drive.example.org/api/service/file?path=${encodeURIComponent(path)}&token=r.1.x&inline=false`);
    mocks.upload.mockImplementation(async (path: string) => ({ path, token: `rw.${path.length}` }));
    mocks.size.mockResolvedValue(1000);
    mocks.attach.mockResolvedValue(undefined);
    mocks.notify.mockResolvedValue(undefined);
    // One linked machine, "dev1", which is active; tests add a second one where it matters.
    mocks.device.update.mockImplementation(async ({ where }) => ({ id: where.id, active: where.id === "dev1", publicKey: null }));
    mocks.device.count.mockResolvedValue(1);
    mocks.device.findFirst.mockImplementation(async ({ where }) => (where.id === "gone" ? null : { id: where.id, active: where.id === "dev1" }));
    mocks.device.findMany.mockResolvedValue([]);
    mocks.devices.mockResolvedValue([]);
    mocks.deliver.mockResolvedValue([]);
    mocks.pairings.mockResolvedValue([]);
    mocks.settings.findUnique.mockResolvedValue(null);
    mocks.settings.upsert.mockImplementation(async ({ create }) => ({ ...create, updatedAt: NOW }));
    mocks.takeCommands.mockResolvedValue([]);
    mocks.recentCommands.mockResolvedValue([]);
  });

  it("starts a job for a listed recording", async () => {
    const view = await startShowEdit({ userId: "u1", showDate: SHOW, sources: [{ path: SRC, role: "auto" }] }, NOW);
    expect(mocks.job.create).toHaveBeenCalledWith({ data: { showDate: SHOW, sourcePaths: [{ path: SRC, role: "auto" }], createdById: "u1" } });
    expect(view).toMatchObject({ status: "QUEUED", sources: [{ path: SRC, role: "auto" }] });
  });

  it("refuses start when publication is not DRAFT", async () => {
    mocks.publication.findUnique.mockResolvedValue({ status: "SCHEDULED", nasPath: "x" });
    await expect(startShowEdit({ userId: "u1", showDate: SHOW, sources: [{ path: SRC, role: "auto" }] }, NOW)).rejects.toMatchObject({ status: 409 });
    expect(mocks.job.create).not.toHaveBeenCalled();
  });

  it("refuses a second unfinished job for the same date", async () => {
    mocks.job.findFirst.mockResolvedValue(job({ status: "RUNNING" }));
    await expect(startShowEdit({ userId: "u1", showDate: SHOW, sources: [{ path: SRC, role: "auto" }] }, NOW)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a path not in the Drive listing, or one still copying", async () => {
    await expect(startShowEdit({ userId: "u1", showDate: SHOW, sources: [{ path: "Shows/other.mov", role: "auto" }] }, NOW)).rejects.toMatchObject({ status: 400 });
    mocks.recordings.mockResolvedValue([{ ...recording, stable: false }]);
    await expect(startShowEdit({ userId: "u1", showDate: SHOW, sources: [{ path: SRC, role: "auto" }] }, NOW)).rejects.toMatchObject({ status: 400 });
    expect(mocks.job.create).not.toHaveBeenCalled();
  });

  it("keeps several recordings in the order picked", async () => {
    const second = { ...recording, path: "Shows/InFocus 10-20 part 2.mov", name: "InFocus 10-20 part 2.mov" };
    mocks.recordings.mockResolvedValue([second, recording]);
    await startShowEdit({ userId: "u1", showDate: SHOW, sources: [{ path: SRC, role: "M" }, { path: second.path, role: "auto" }] }, NOW);
    expect(mocks.job.create.mock.calls[0][0].data.sourcePaths).toEqual([{ path: SRC, role: "M" }, { path: second.path, role: "auto" }]);
  });

  it("refuses a selection that can't be edited, with a plain reason", async () => {
    await expect(startShowEdit({ userId: "u1", showDate: SHOW, sources: [] }, NOW)).rejects.toMatchObject({ status: 400, message: "Pick at least one recording." });
    await expect(startShowEdit({ userId: "u1", showDate: SHOW, sources: [{ path: SRC, role: "ignore" }] }, NOW))
      .rejects.toMatchObject({ status: 400, message: "Every file is set to Ignore. Use at least one." });
    expect(mocks.job.create).not.toHaveBeenCalled();
  });

  it("an old job's plain path list reads as files on Auto, and Redo keeps it that way", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "FAILED", sourcePaths: [SRC, "Shows/b.mov"] }));
    await redoShowEdit({ userId: "u1", id: "job1", note: "Try again" }, NOW);
    expect(mocks.job.create.mock.calls[0][0].data.sourcePaths).toEqual([{ path: SRC, role: "auto" }, { path: "Shows/b.mov", role: "auto" }]);
  });

  it("the brief lists sources with roles, order and export time; ignored files are neither downloaded nor in sourcePaths", async () => {
    const recordings = ["A", "B", "C"].map((part, index) => ({ ...recording, path: `Shows/${part}.mov`, name: `${part}.mov`, size: 100 + index }));
    mocks.recordings.mockResolvedValue(recordings);
    mocks.job.findFirst.mockResolvedValueOnce(job({ sourcePaths: [
      { path: "Shows/A.mov", role: "M" }, { path: "Shows/B.mov", role: "ignore" }, { path: "Shows/C.mov", role: "auto" }
    ] }));
    const claim = (await claimNextShowEdit("dev1", NOW))!;
    const at = recording.modifiedAt;
    expect(claim.brief.sources).toEqual([
      { path: "Shows/A.mov", role: "M", order: 1, modifiedAt: at },
      { path: "Shows/B.mov", role: "ignore", order: 2, modifiedAt: at },
      { path: "Shows/C.mov", role: "auto", order: 3, modifiedAt: at }
    ]);
    expect(claim.brief.sourcePaths).toEqual(["Shows/A.mov", "Shows/C.mov"]);
    expect(claim.downloads!.map((entry) => [entry.path, entry.size])).toEqual([["Shows/A.mov", 100], ["Shows/C.mov", 102]]);
  });

  it("the brief carries the class roster by full name", async () => {
    mocks.job.findFirst.mockResolvedValueOnce(job());
    expect((await claimNextShowEdit("dev1", NOW))!.brief.roster).toEqual(["Abby Ames", "Otto Ortiz", "Sage Stone"]);
  });

  it("the brief carries other shows' announcement cards as pastCards", async () => {
    mocks.job.findFirst.mockResolvedValueOnce(job());
    const past = { showDate: "2026-10-16", checks: { cards: [{ title: "Math Club", points: ["Room 204"], script: "Math Club meets Tuesday." }] } };
    // Only the past-cards query asks for finished edits; the stale-job sweep gets nothing.
    mocks.job.findMany.mockImplementation(async ({ where }) => (where?.status?.in ? [past] : []));
    const claim = (await claimNextShowEdit("dev1", NOW))!;
    expect(claim.brief.pastCards).toEqual([{ showDate: "2026-10-16", title: "Math Club", points: ["Room 204"], script: "Math Club meets Tuesday." }]);
    expect(mocks.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { in: ["REVIEW", "PUBLISHED"] }, showDate: { not: SHOW } } }));
  });

  it("claims the oldest queued job once", async () => {
    mocks.job.findFirst.mockResolvedValueOnce(job()).mockResolvedValueOnce(job()).mockResolvedValue(null);
    mocks.job.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const [a, b] = await Promise.all([claimNextShowEdit("dev1", NOW), claimNextShowEdit("dev1", NOW)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const claim = (a ?? b)!;
    expect(claim.kind).toBe("edit");
    expect(claim.job).toEqual({ id: "job1", showDate: SHOW, version: 1, attempt: 0, status: "RUNNING" });
    expect(claim.brief.outputNasPath).toMatch(/^Package Storage\/Shows\/2026-10-21\/InFocus Show 2026-10-21-[a-z0-9]+\.mp4$/);
    expect(claim.brief.posterNasPath).toBe(claim.brief.outputNasPath.replace(/\.mp4$/, ".poster.jpg"));
    expect(claim.brief).toMatchObject({ jobId: "job1", showDate: SHOW, version: 1, sourcePaths: [SRC], filmedOn: "2026-10-20",
      anchors: ["Abby Ames", "Otto Ortiz"], announcements: ["Math Club meets after school."], packages: [], note: null });
    expect(claim.downloads).toEqual([{ path: SRC, url: expect.stringContaining("inline=false"), size: 345_000_000 }]);
    expect(mocks.job.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "QUEUED", OR: [{ deviceId: null }, { deviceId: "dev1" }] }, orderBy: { createdAt: "asc" }
    }));
    expect(mocks.job.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RUNNING", deviceId: "dev1" }) }));
  });

  it("claim returns null when the queue is empty", async () => {
    expect(await claimNextShowEdit("dev1", NOW)).toBeNull();
  });

  it("requeues stale running jobs", async () => {
    const stale = new Date(NOW.getTime() - 16 * 60_000);
    mocks.job.findMany.mockResolvedValueOnce([
      job({ id: "a", status: "RUNNING", attempt: 0, heartbeatAt: stale }),
      job({ id: "b", status: "RUNNING", attempt: 2, heartbeatAt: stale })
    ]);
    await claimNextShowEdit("dev1", NOW);
    expect(mocks.job.updateMany).toHaveBeenCalledWith({
      where: { id: "a", status: "RUNNING" },
      data: expect.objectContaining({ status: "QUEUED", attempt: 1 })
    });
    expect(mocks.job.updateMany).toHaveBeenCalledWith({
      where: { id: "b", status: "RUNNING" },
      data: expect.objectContaining({ status: "FAILED", error: "The editing machine stopped responding." })
    });
  });

  it("cancel of a running job sets cancelRequested and progress returns cancel: true", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING" }));
    await cancelShowEdit({ id: "job1" }, NOW);
    expect(mocks.job.update).toHaveBeenCalledWith({ where: { id: "job1" }, data: { cancelRequested: true } });
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", cancelRequested: true }));
    expect(await reportShowEditProgress({ id: "job1", stage: "render", message: "Rendering" }, NOW)).toEqual({ cancel: true });
  });

  it("cancels a queued job at once", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job());
    await cancelShowEdit({ id: "job1" }, NOW);
    expect(mocks.job.updateMany).toHaveBeenCalledWith({
      where: { id: "job1", status: "QUEUED" }, data: expect.objectContaining({ status: "CANCELLED" })
    });
  });

  it("progress records the stage and heartbeat", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING" }));
    expect(await reportShowEditProgress({ id: "job1", stage: "analyze", message: "Finding takes" }, NOW)).toEqual({ cancel: false });
    expect(mocks.job.update).toHaveBeenCalledWith({ where: { id: "job1" }, data: { stage: "analyze", message: "Finding takes", heartbeatAt: NOW } });
  });

  it("redo copies the sources, roles and note", async () => {
    const sources = [{ path: SRC, role: "M" }, { path: "Shows/b.mov", role: "L" }];
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "REVIEW", sourcePaths: sources }));
    await redoShowEdit({ userId: "u2", id: "job1", note: "Use the second take of the close." }, NOW);
    expect(mocks.job.create).toHaveBeenCalledWith({ data: {
      showDate: SHOW, sourcePaths: sources, note: "Use the second take of the close.", createdById: "u2"
    } });
    expect(mocks.job.updateMany).toHaveBeenCalledWith({ where: { id: "job1", status: "REVIEW" }, data: expect.objectContaining({ status: "CANCELLED" }) });
  });

  it("redo without a note stores none", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "FAILED" }));
    await redoShowEdit({ userId: "u2", id: "job1" }, NOW);
    expect(mocks.job.create).toHaveBeenCalledWith({ data: expect.objectContaining({ note: null }) });
  });

  it("brief lists queued packages in queue order with their nasPath", async () => {
    mocks.job.findFirst.mockResolvedValueOnce(job());
    mocks.rows.mockResolvedValue([
      { groupTopic: "football", finalCutToss: "Here's Sage with football.", finalCutMediaItem: { title: "Football", currentVersion: { nasPath: "Package Storage/Publishing Queue/Football/football.mp4" } } },
      { groupTopic: "robotics", finalCutToss: "", finalCutMediaItem: { title: "Robotics", currentVersion: { nasPath: "Package Cycles/Robotics/robotics.mp4" } } },
      { groupTopic: "no file yet", finalCutToss: "", finalCutMediaItem: null }
    ]);
    const claim = await claimNextShowEdit("dev1", NOW);
    expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({
      where: { queuedForAirAt: { not: null }, queuedForShowDate: SHOW }, orderBy: { queuedForAirAt: "asc" }
    }));
    expect(claim!.brief.packages).toEqual([
      { title: "Football", nasPath: "Package Storage/Publishing Queue/Football/football.mp4", toss: "Here's Sage with football." },
      { title: "Robotics", nasPath: "Package Cycles/Robotics/robotics.mp4", toss: null }
    ]);
    expect(claim!.downloads!.map((entry) => entry.path)).toEqual([
      SRC, "Package Storage/Publishing Queue/Football/football.mp4", "Package Cycles/Robotics/robotics.mp4"
    ]);
  });

  it("fix request queues the job with kind fix and keeps the session id", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "REVIEW", agentSessionId: "sess-1", outputNasPath: "Package Storage/Shows/2026-10-21/a.mp4" }));
    mocks.publication.findUnique.mockResolvedValue({ status: "DRAFT", nasPath: "Package Storage/Shows/2026-10-21/a.mp4" });
    await requestShowFix({ userId: "u1", id: "job1", text: "  The Unity Day card should say Tomorrow.  ", remember: true }, NOW);
    expect(mocks.job.updateMany).toHaveBeenCalledWith({
      where: { id: "job1", status: "REVIEW" },
      data: expect.objectContaining({
        status: "QUEUED", pendingFix: "The Unity Day card should say Tomorrow.", rememberFix: true,
        conversation: [{ from: "producer", text: "The Unity Day card should say Tomorrow.", at: NOW.toISOString() }]
      })
    });

    mocks.job.findFirst.mockResolvedValueOnce(job({
      status: "QUEUED", agentSessionId: "sess-1", pendingFix: "The Unity Day card should say Tomorrow.", rememberFix: true
    }));
    const claim = await claimNextShowEdit("dev1", NOW);
    expect(claim).toMatchObject({
      kind: "fix",
      fix: { text: "The Unity Day card should say Tomorrow.", remember: true, agentSessionId: "sess-1", version: 2 },
      brief: { version: 2 }
    });
    expect(claim).not.toHaveProperty("downloads");
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("fix request is refused after the show was sent to YouTube", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "REVIEW" }));
    mocks.publication.findUnique.mockResolvedValue({ status: "SCHEDULED", nasPath: "x" });
    await expect(requestShowFix({ userId: "u1", id: "job1", text: "Fix the card", remember: false }, NOW)).rejects.toMatchObject({ status: 409 });
  });

  it("completing an edit attaches the draft and stops at REVIEW", async () => {
    const out = "Package Storage/Shows/2026-10-21/InFocus Show 2026-10-21-abc.mp4";
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: out, costUsd: null }));
    await completeShowEdit({
      id: "job1", outputNasPath: out, decisions: [{ kind: "name", detail: "Roster spelling", flagged: false }],
      checks: { coversClean: true, loudness: [{ segment: "open", ok: true }] }, needsReview: false, costUsd: 3.5, agentSessionId: "sess-1"
    }, NOW);
    expect(mocks.attach).toHaveBeenCalledWith({ userId: "u1", showDate: SHOW, nasPath: out });
    expect(mocks.job.update).toHaveBeenCalledWith({ where: { id: "job1" }, data: expect.objectContaining({
      status: "REVIEW", costUsd: 3.5, agentSessionId: "sess-1", needsReview: false, finishedAt: NOW
    }) });
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ id: "job1" }), "review");
  });

  it("complete rejects an outputNasPath that differs from the brief", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: "Package Storage/Shows/2026-10-21/a.mp4" }));
    await expect(completeShowEdit({
      id: "job1", outputNasPath: "Package Storage/Shows/2026-10-21/b.mp4", decisions: [], checks: {}, needsReview: false, costUsd: 1, agentSessionId: "s"
    }, NOW)).rejects.toMatchObject({ status: 409 });
    expect(mocks.attach).not.toHaveBeenCalled();
  });

  it("completing a fix bumps version, clears pendingFix and appends the reply", async () => {
    const out = "Package Storage/Shows/2026-10-21/InFocus Show 2026-10-21-v2.mp4";
    const earlier = [{ from: "producer", text: "Fix the card", at: "2026-10-20T21:30:00.000Z" }];
    mocks.job.findUnique.mockResolvedValueOnce(job({
      status: "RUNNING", outputNasPath: out, pendingFix: "Fix the card", version: 1, costUsd: 4, conversation: earlier
    }));
    await completeShowEdit({
      id: "job1", outputNasPath: out, decisions: [], checks: { coversClean: true, loudness: [] }, needsReview: false,
      costUsd: 0.5, agentSessionId: "sess-1", reply: "Changed the Unity Day card, rebuilt as v2."
    }, NOW);
    expect(mocks.job.update).toHaveBeenCalledWith({ where: { id: "job1" }, data: expect.objectContaining({
      status: "REVIEW", pendingFix: null, rememberFix: false, version: 2, costUsd: 4.5,
      conversation: [...earlier, { from: "editor", text: "Changed the Unity Day card, rebuilt as v2.", at: NOW.toISOString(), version: 2 }]
    }) });
  });

  it("a fix without a reply is refused", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: "o.mp4", pendingFix: "Fix it" }));
    await expect(completeShowEdit({
      id: "job1", outputNasPath: "o.mp4", decisions: [], checks: {}, needsReview: false, costUsd: 0, agentSessionId: "s"
    }, NOW)).rejects.toMatchObject({ status: 400 });
  });

  it("complete is refused once the show was sent to YouTube", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: "o.mp4" }));
    mocks.attach.mockRejectedValue(new ShowUploadError("This show was already sent to YouTube.", 409));
    await expect(completeShowEdit({
      id: "job1", outputNasPath: "o.mp4", decisions: [], checks: {}, needsReview: false, costUsd: 0, agentSessionId: "s"
    }, NOW)).rejects.toMatchObject({ status: 409 });
  });

  it("a failed fix goes back to REVIEW on the previous version", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", pendingFix: "Fix it", outputNasPath: "new.mp4" }));
    mocks.publication.findUnique.mockResolvedValue({ status: "DRAFT", nasPath: "Package Storage/Shows/2026-10-21/old.mp4" });
    await failShowEdit({ id: "job1", error: "The render failed", cancelled: false }, NOW);
    expect(mocks.job.update).toHaveBeenCalledWith({ where: { id: "job1" }, data: expect.objectContaining({
      status: "REVIEW", pendingFix: null, outputNasPath: "Package Storage/Shows/2026-10-21/old.mp4",
      posterNasPath: "Package Storage/Shows/2026-10-21/old.poster.jpg", error: "The render failed"
    }) });
  });

  it("a failed edit is FAILED and a cancelled one CANCELLED", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING" }));
    await failShowEdit({ id: "job1", error: "No anchor shot found", cancelled: false }, NOW);
    expect(mocks.job.update).toHaveBeenLastCalledWith({ where: { id: "job1" }, data: expect.objectContaining({ status: "FAILED", error: "No anchor shot found" }) });
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), "failed");
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", cancelRequested: true }));
    await failShowEdit({ id: "job1", error: "Cancelled", cancelled: true }, NOW);
    expect(mocks.job.update).toHaveBeenLastCalledWith({ where: { id: "job1" }, data: expect.objectContaining({ status: "CANCELLED" }) });
  });

  it("upload targets mint read/write tokens for the claimed paths and the run's debug bundle", async () => {
    const stamp = NOW.getTime().toString(36);
    mocks.job.findUnique.mockResolvedValueOnce(job({
      status: "RUNNING", claimedAt: NOW,
      outputNasPath: `Package Storage/Shows/2026-10-21/InFocus Show 2026-10-21-${stamp}.mp4`,
      posterNasPath: `Package Storage/Shows/2026-10-21/InFocus Show 2026-10-21-${stamp}.poster.jpg`
    }));
    expect(await showEditUploadTargets("job1", NOW)).toEqual({
      driveBaseUrl: "https://drive.example.org",
      video: { path: `Package Storage/Shows/2026-10-21/InFocus Show 2026-10-21-${stamp}.mp4`, token: expect.stringMatching(/^rw\./) },
      poster: { path: `Package Storage/Shows/2026-10-21/InFocus Show 2026-10-21-${stamp}.poster.jpg`, token: expect.stringMatching(/^rw\./) },
      log: { path: `Package Storage/Shows/2026-10-21/editor-logs/job1-v1-${stamp}.tar.gz`, token: expect.stringMatching(/^rw\./) }
    });
    expect(mocks.upload).toHaveBeenCalledTimes(3);
  });

  it("a fix run's debug bundle is named for the version it makes", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({
      status: "RUNNING", claimedAt: NOW, pendingFix: "Fix the card", version: 2, outputNasPath: "o.mp4", posterNasPath: "o.poster.jpg"
    }));
    const targets = await showEditUploadTargets("job1", NOW);
    expect(targets.log.path).toBe(`Package Storage/Shows/2026-10-21/editor-logs/job1-v3-${NOW.getTime().toString(36)}.tar.gz`);
  });

  describe("debug logs", () => {
    const LOG = (name: string) => `Package Storage/Shows/2026-10-21/editor-logs/${name}`;
    const finished = { decisions: [], needsReview: false, costUsd: 1, agentSessionId: "s" };

    it("complete stores a valid debugLogPath in checks next to the run's own checks", async () => {
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: "o.mp4" }));
      await completeShowEdit({ id: "job1", outputNasPath: "o.mp4", checks: { coversClean: true }, debugLogPath: LOG("job1-v1-abc.tar.gz"), ...finished }, NOW);
      expect(mocks.job.update.mock.calls[0][0].data.checks).toEqual({
        coversClean: true,
        debugLog: LOG("job1-v1-abc.tar.gz"),
        debugLogs: [{ version: 1, path: LOG("job1-v1-abc.tar.gz"), at: NOW.toISOString() }]
      });
    });

    it("complete and fail refuse a debugLogPath for another date, another job, with .. or the wrong extension", async () => {
      const bad = [
        "Package Storage/Shows/2026-10-22/editor-logs/job1-v1-abc.tar.gz",
        LOG("job2-v1-abc.tar.gz"),
        LOG("job1-v1-../../x.tar.gz"),
        LOG("job1-v1-abc.zip"),
        LOG("job1-v1-abc.tar.gz.mp4"),
        LOG("job1-v1/abc.tar.gz")
      ];
      for (const debugLogPath of bad) {
        mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: "o.mp4" }));
        await expect(completeShowEdit({ id: "job1", outputNasPath: "o.mp4", checks: {}, debugLogPath, ...finished }, NOW)).rejects.toMatchObject({ status: 400 });
        mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING" }));
        await expect(failShowEdit({ id: "job1", error: "x", cancelled: false, debugLogPath }, NOW)).rejects.toMatchObject({ status: 400 });
      }
      expect(mocks.attach).not.toHaveBeenCalled();
      expect(mocks.job.update).not.toHaveBeenCalled();
    });

    it("a fix completion appends its log to the earlier versions' logs", async () => {
      const v1 = { version: 1, path: LOG("job1-v1-abc.tar.gz"), at: "2026-10-20T20:00:00.000Z" };
      mocks.job.findUnique.mockResolvedValueOnce(job({
        status: "RUNNING", outputNasPath: "o2.mp4", pendingFix: "Fix it", version: 1,
        checks: { coversClean: false, debugLog: v1.path, debugLogs: [v1] }
      }));
      await completeShowEdit({
        id: "job1", outputNasPath: "o2.mp4", checks: { coversClean: true }, reply: "Fixed.", debugLogPath: LOG("job1-v2-def.tar.gz"), ...finished
      }, NOW);
      expect(mocks.job.update.mock.calls[0][0].data.checks).toEqual({
        coversClean: true,
        debugLog: LOG("job1-v2-def.tar.gz"),
        debugLogs: [v1, { version: 2, path: LOG("job1-v2-def.tar.gz"), at: NOW.toISOString() }]
      });
    });

    it("a failed fix keeps the earlier checks and adds the failed run's log", async () => {
      const v1 = { version: 1, path: LOG("job1-v1-abc.tar.gz"), at: "2026-10-20T20:00:00.000Z" };
      mocks.job.findUnique.mockResolvedValueOnce(job({
        status: "RUNNING", pendingFix: "Fix it", version: 1, outputNasPath: "o2.mp4", checks: { coversClean: true, debugLog: v1.path, debugLogs: [v1] }
      }));
      await failShowEdit({ id: "job1", error: "Render failed", cancelled: false, debugLogPath: LOG("job1-v2-def.tar.gz") }, NOW);
      expect(mocks.job.update).toHaveBeenCalledWith({ where: { id: "job1" }, data: expect.objectContaining({
        status: "REVIEW",
        checks: { coversClean: true, debugLog: LOG("job1-v2-def.tar.gz"), debugLogs: [v1, { version: 2, path: LOG("job1-v2-def.tar.gz"), at: NOW.toISOString() }] }
      }) });
    });

    it("a failed or cancelled edit records its log; one that already ended still keeps it", async () => {
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", cancelRequested: true }));
      await failShowEdit({ id: "job1", error: "Cancelled", cancelled: true, debugLogPath: LOG("job1-v1-abc.tar.gz") }, NOW);
      expect(mocks.job.update).toHaveBeenLastCalledWith({ where: { id: "job1" }, data: expect.objectContaining({
        status: "CANCELLED", checks: { debugLog: LOG("job1-v1-abc.tar.gz"), debugLogs: [{ version: 1, path: LOG("job1-v1-abc.tar.gz"), at: NOW.toISOString() }] }
      }) });
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "FAILED" }));
      await failShowEdit({ id: "job1", error: "late", cancelled: false, debugLogPath: LOG("job1-v1-def.tar.gz") }, NOW);
      expect(mocks.job.update).toHaveBeenLastCalledWith({ where: { id: "job1" }, data: {
        checks: { debugLog: LOG("job1-v1-def.tar.gz"), debugLogs: [{ version: 1, path: LOG("job1-v1-def.tar.gz"), at: NOW.toISOString() }] }
      } });
    });

    it("the old payload without debugLogPath stores checks as sent and leaves a failure's checks alone", async () => {
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: "o.mp4" }));
      await completeShowEdit({ id: "job1", outputNasPath: "o.mp4", checks: { coversClean: true }, ...finished }, NOW);
      expect(mocks.job.update.mock.calls[0][0].data.checks).toEqual({ coversClean: true });
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", checks: { coversClean: true } }));
      await failShowEdit({ id: "job1", error: "x", cancelled: false }, NOW);
      expect(mocks.job.update.mock.calls[1][0].data).not.toHaveProperty("checks");
    });

    it("the producer's view lists logs newest first, with links for the newest five", async () => {
      const logs = Array.from({ length: 6 }, (_, index) => ({
        version: index + 1, path: LOG(`job1-v${index + 1}-s${index}.tar.gz`), at: `2026-10-20T2${index}:00:00.000Z`
      }));
      mocks.job.findFirst.mockResolvedValue(job({ status: "REVIEW", version: 6, checks: { debugLog: logs[5].path, debugLogs: logs } }));
      const state = await showEditState(SHOW, NOW);
      expect(state.job!.debugLogs.map((log) => log.version)).toEqual([6, 5, 4, 3, 2, 1]);
      expect(state.job!.debugLogs[0]).toEqual({ version: 6, url: expect.stringContaining(encodeURIComponent(logs[5].path)), at: logs[5].at });
      expect(state.job!.debugLogs.slice(0, 5).every((log) => log.url?.includes("token="))).toBe(true);
      expect(state.job!.debugLogs[5].url).toBeNull();
      expect(mocks.download).toHaveBeenCalledTimes(5);
    });

    it("a FAILED edit's log has a link; a running job mints none; a link that fails to mint is null", async () => {
      const log = { version: 1, path: LOG("job1-v1-abc.tar.gz"), at: "2026-10-20T20:00:00.000Z" };
      mocks.job.findFirst.mockResolvedValue(job({ status: "FAILED", checks: { debugLogs: [log] } }));
      expect((await showEditState(SHOW, NOW)).job!.debugLogs[0].url).toContain("token=");
      mocks.download.mockClear();
      mocks.job.findFirst.mockResolvedValue(job({ status: "RUNNING", pendingFix: "Fix it", checks: { debugLogs: [log] } }));
      expect((await showEditState(SHOW, NOW)).job!.debugLogs).toEqual([{ version: 1, url: null, at: log.at }]);
      expect(mocks.download).not.toHaveBeenCalled();
      mocks.download.mockRejectedValueOnce(new Error("Drive down"));
      mocks.job.findFirst.mockResolvedValue(job({ status: "CANCELLED", checks: { debugLogs: [log] } }));
      expect((await showEditState(SHOW, NOW)).job!.debugLogs).toEqual([{ version: 1, url: null, at: log.at }]);
    });
  });

  const healthy = { ok: true, problems: [] as string[] };

  it("heartbeat keeps the machine's own running job fresh and returns its cancel requests", async () => {
    mocks.job.findMany.mockResolvedValueOnce([{ id: "job1" }]);
    const result = await recordHeartbeat({ deviceId: "dev1", version: "0.1.0", busy: true, health: healthy }, NOW);
    expect(result).toEqual({
      active: true, cancelJobIds: ["job1"], targetVersion: null, credentials: [], commands: [],
      settings: { agentOrder: ["claude", "codex", "grok"], targetVersion: null }
    });
    expect(mocks.device.update).toHaveBeenCalledWith({
      where: { id: "dev1" }, data: { lastSeenAt: NOW, version: "0.1.0", busy: true, health: healthy }
    });
    expect(mocks.job.updateMany).toHaveBeenCalledWith({ where: { status: "RUNNING", deviceId: "dev1" }, data: { heartbeatAt: NOW } });
    expect(mocks.job.findMany).toHaveBeenCalledWith({ where: { status: "RUNNING", deviceId: "dev1", cancelRequested: true }, select: { id: true } });
    expect(mocks.autoStart).not.toHaveBeenCalled();
  });

  it("heartbeat records the machine's name and kind (the legacy machine keeps its name)", async () => {
    mocks.job.findMany.mockResolvedValue([]);
    await recordHeartbeat({ deviceId: "dev1", version: "v0.3.1", busy: false, health: healthy, machine: { name: "Abby's laptop", kind: "personal" } }, NOW);
    expect(mocks.device.update.mock.calls[0][0].data).toMatchObject({ name: "Abby's laptop", kind: "personal" });
    await recordHeartbeat({ deviceId: "legacy", version: "v0.3.1", busy: false, health: healthy, machine: { name: "Old Mac", kind: "dedicated" } }, NOW);
    expect(mocks.device.update.mock.calls[1][0].data).toMatchObject({ kind: "dedicated" });
    expect(mocks.device.update.mock.calls[1][0].data).not.toHaveProperty("name");
  });

  it("an inactive machine hears it isn't active; with no active machine at all, it takes over", async () => {
    mocks.job.findMany.mockResolvedValue([]);
    expect((await recordHeartbeat({ deviceId: "laptop", version: "v0.3.1", busy: false, health: healthy }, NOW)).active).toBe(false);
    expect(mocks.activate).not.toHaveBeenCalled();
    mocks.device.count.mockResolvedValue(0);
    expect((await recordHeartbeat({ deviceId: "laptop", version: "v0.3.1", busy: false, health: healthy }, NOW)).active).toBe(true);
    expect(mocks.activate).toHaveBeenCalledWith("laptop");
  });

  it("heartbeat passes the pinned editor version through", async () => {
    vi.stubEnv("SHOW_EDITOR_TARGET_VERSION", " v0.3.1 ");
    mocks.job.findMany.mockResolvedValue([]);
    expect(await recordHeartbeat({ deviceId: "dev1", version: "v0.3.2", busy: false, health: healthy }, NOW))
      .toMatchObject({ cancelJobIds: [], targetVersion: "v0.3.1", settings: { targetVersion: "v0.3.1" } });
    vi.stubEnv("SHOW_EDITOR_TARGET_VERSION", "");
    expect((await recordHeartbeat({ deviceId: "dev1", version: "v0.3.2", busy: false, health: healthy }, NOW)).targetVersion).toBeNull();
  });

  it("heartbeat stores the key and backends, applies acks, then delivers that machine's sealed sign-ins", async () => {
    const order: string[] = [];
    mocks.acks.mockImplementation(async () => { order.push("acks"); });
    mocks.purge.mockImplementation(async () => { order.push("purge"); });
    mocks.deliver.mockImplementation(async () => { order.push("deliver"); return [{ id: "p2", backend: "codex", ciphertext: "c2VhbGVk" }]; });
    mocks.job.findMany.mockResolvedValueOnce([]);
    const backends = [{ name: "claude" as const, connected: true, detail: "Signed in" }];
    const result = await recordHeartbeat({
      deviceId: "dev1", version: "v0.3.1", busy: false, health: healthy, publicKey: "S0VZ", backends,
      credentialAcks: [{ id: "p1", ok: true }]
    }, NOW);
    expect(mocks.device.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ publicKey: "S0VZ", backends }) }));
    expect(mocks.acks).toHaveBeenCalledWith([{ id: "p1", ok: true }], "dev1");
    expect(mocks.deliver).toHaveBeenCalledWith("dev1", "S0VZ", NOW);
    expect(order).toEqual(["acks", "purge", "deliver"]);
    expect(result.credentials).toEqual([{ id: "p2", backend: "codex", ciphertext: "c2VhbGVk" }]);
  });

  it("heartbeat round-trips the machine's own remote commands and the settings", async () => {
    mocks.settings.findUnique.mockResolvedValue({ autoStart: null, autoPublish: null, targetVersion: "v0.3.1", agentOrder: ["codex", "claude"], houseRules: null, updatedAt: NOW });
    mocks.takeCommands.mockResolvedValue([{ id: "cmd2", kind: "logs" }]);
    mocks.job.findMany.mockResolvedValueOnce([]);
    const result = await recordHeartbeat({
      deviceId: "dev1", version: "v0.3.1", busy: false, health: healthy,
      commandAcks: [{ id: "cmd1", ok: true, output: "All checks passed." }]
    }, NOW);
    expect(mocks.commandAcks).toHaveBeenCalledWith([{ id: "cmd1", ok: true, output: "All checks passed." }], "dev1", NOW);
    expect(mocks.takeCommands).toHaveBeenCalledWith("dev1", NOW);
    expect(result).toMatchObject({
      commands: [{ id: "cmd2", kind: "logs" }],
      settings: { agentOrder: ["codex", "claude"], targetVersion: "v0.3.1" },
      targetVersion: "v0.3.1"
    });
  });

  it("a saved auto-start setting wins over the env var", async () => {
    vi.stubEnv("SHOW_EDITOR_AUTO_START", "1");
    mocks.settings.findUnique.mockResolvedValue({ autoStart: false, autoPublish: null, targetVersion: null, agentOrder: null, houseRules: null, updatedAt: NOW });
    mocks.job.findMany.mockResolvedValueOnce([]);
    await recordHeartbeat({ deviceId: "dev1", version: "v0.3.1", busy: false, health: healthy }, NOW);
    expect(mocks.autoStart).not.toHaveBeenCalled();
  });

  it("the brief carries the producers' house rules (null when unset)", async () => {
    mocks.job.findFirst.mockResolvedValueOnce(job());
    expect((await claimNextShowEdit("dev1", NOW))!.brief.houseRules).toBeNull();
    mocks.settings.findUnique.mockResolvedValue({ autoStart: null, autoPublish: null, targetVersion: null, agentOrder: null, houseRules: "1. Keep it short.", updatedAt: NOW });
    mocks.job.findFirst.mockResolvedValueOnce(job());
    expect((await claimNextShowEdit("dev1", NOW))!.brief.houseRules).toBe("1. Keep it short.");
  });

  it("completing a remembered fix saves the updated house rules", async () => {
    const out = "Package Storage/Shows/2026-10-21/v2.mp4";
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: out, pendingFix: "Say Tomorrow", rememberFix: true }));
    await completeShowEdit({
      id: "job1", outputNasPath: out, decisions: [], checks: {}, needsReview: false, costUsd: 0.4, agentSessionId: "claude:s1",
      reply: "Changed the card.", houseRules: "1. Fresh graphics.\n13. Unity Day cards say Tomorrow."
    }, NOW);
    expect(mocks.settings.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { updatedById: null, houseRules: "1. Fresh graphics.\n13. Unity Day cards say Tomorrow." }
    }));
  });

  it("an edit without houseRules leaves the saved rules alone", async () => {
    mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: "o.mp4" }));
    await completeShowEdit({ id: "job1", outputNasPath: "o.mp4", decisions: [], checks: {}, needsReview: false, costUsd: 0, agentSessionId: "s" }, NOW);
    expect(mocks.settings.upsert).not.toHaveBeenCalled();
  });

  it("heartbeat runs auto-start only when it is switched on", async () => {
    vi.stubEnv("SHOW_EDITOR_AUTO_START", "1");
    mocks.job.findMany.mockResolvedValueOnce([]);
    mocks.autoStart.mockResolvedValue(undefined);
    await recordHeartbeat({ deviceId: "dev1", version: "0.1.0", busy: false, health: healthy }, NOW);
    expect(mocks.autoStart).toHaveBeenCalledWith(NOW);
  });

  const machine = (overrides: Record<string, unknown>) => ({
    id: "dev1", name: "Team MacBook", kind: "dedicated", active: true, online: true, linkedAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString(), version: "v0.3.1", busy: false, health: healthy, backends: [], ...overrides
  });

  it("state reports the active machine's status, every machine and recent commands", async () => {
    mocks.devices.mockResolvedValue([
      machine({ online: false, lastSeenAt: new Date(NOW.getTime() - 4 * 60_000).toISOString(), health: { ok: false, problems: ["The Mac is on battery."] } }),
      machine({ id: "laptop", name: "Abby's laptop", kind: "personal", active: false })
    ]);
    mocks.recentCommands.mockResolvedValue([{ id: "cmd1", deviceId: "dev1", kind: "doctor", status: "DONE", output: "ok", createdAt: NOW.toISOString(), finishedAt: NOW.toISOString() }]);
    const state = await showEditState(SHOW, NOW);
    expect(state.worker).toMatchObject({ online: false, health: { ok: false, problems: ["The Mac is on battery."] } });
    expect(state.devices).toHaveLength(2);
    expect(mocks.recentCommands).toHaveBeenCalledWith(["dev1", "laptop"]);
    expect(state.commands).toHaveLength(1);
    expect(state.settings).toMatchObject({ autoStart: false, agentOrder: ["claude", "codex", "grok"], houseRules: null });
    expect(state.recordings).toEqual([recording]);
    expect(state.job).toBeNull();
    expect(state.waitingFor).toBeNull();
  });

  it("with no machine linked the editor shows offline", async () => {
    const state = await showEditState(SHOW, NOW);
    expect(state.worker).toEqual({ online: false, lastSeenAt: null, busy: false, version: null, health: null });
  });

  describe("several machines, one active", () => {
    it("only the active machine gets new edits", async () => {
      mocks.job.findFirst.mockResolvedValue(null);
      expect(await claimNextShowEdit("laptop", NOW)).toBeNull();
      expect(mocks.job.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
        where: { status: "QUEUED", deviceId: "laptop", pendingFix: { not: null } }
      }));
      mocks.job.findFirst.mockResolvedValueOnce(job());
      expect((await claimNextShowEdit("dev1", NOW))!.kind).toBe("edit");
    });

    it("an inactive machine still gets the fix for its own edit", async () => {
      mocks.job.findFirst.mockResolvedValueOnce(job({ deviceId: "laptop", pendingFix: "Fix the card", agentSessionId: "codex:s1" }));
      const claim = await claimNextShowEdit("laptop", NOW);
      expect(claim).toMatchObject({ kind: "fix", fix: { agentSessionId: "codex:s1" } });
      expect(mocks.job.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deviceId: "laptop" }) }));
    });

    it("an unlinked machine claims nothing", async () => {
      expect(await claimNextShowEdit("gone", NOW)).toBeNull();
      expect(mocks.job.findFirst).not.toHaveBeenCalled();
    });

    it("switching the active machine mid-job leaves the running job where it is", async () => {
      // The job runs on dev1; laptop became active. dev1's heartbeats still keep its own job fresh.
      mocks.device.update.mockImplementation(async ({ where }) => ({ id: where.id, active: false, publicKey: null }));
      mocks.job.findMany.mockResolvedValue([]);
      const beat = await recordHeartbeat({ deviceId: "dev1", version: "v0.3.1", busy: true, health: healthy }, NOW);
      expect(beat.active).toBe(false);
      expect(mocks.job.updateMany).toHaveBeenCalledWith({ where: { status: "RUNNING", deviceId: "dev1" }, data: { heartbeatAt: NOW } });
      // And it can still finish it.
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", deviceId: "dev1", outputNasPath: "o.mp4" }));
      await completeShowEdit({ id: "job1", outputNasPath: "o.mp4", decisions: [], checks: {}, needsReview: false, costUsd: 1, agentSessionId: "claude:s" }, NOW);
      expect(mocks.job.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "REVIEW" }) }));
    });

    it("a requeued edit is free for the active machine; a requeued fix waits for its machine", async () => {
      const stale = new Date(NOW.getTime() - 16 * 60_000);
      mocks.job.findMany.mockResolvedValueOnce([
        job({ id: "edit", status: "RUNNING", deviceId: "laptop", heartbeatAt: stale }),
        job({ id: "fix", status: "RUNNING", deviceId: "laptop", pendingFix: "Fix it", heartbeatAt: stale })
      ]);
      await claimNextShowEdit("dev1", NOW);
      expect(mocks.job.updateMany).toHaveBeenCalledWith({ where: { id: "edit", status: "RUNNING" }, data: expect.objectContaining({ status: "QUEUED", deviceId: null }) });
      const fixRequeue = mocks.job.updateMany.mock.calls.find(([args]) => args.where.id === "fix")![0];
      expect(fixRequeue.data).toMatchObject({ status: "QUEUED" });
      expect(fixRequeue.data).not.toHaveProperty("deviceId");
    });

    it("unlinking the job's machine makes its waiting fix fail with the Redo message", async () => {
      mocks.revoke.mockResolvedValue({ revoked: "laptop" });
      mocks.job.findMany.mockResolvedValueOnce([job({ status: "QUEUED", deviceId: "laptop", pendingFix: "Fix the card" })]);
      mocks.publication.findUnique.mockResolvedValue({ status: "DRAFT", nasPath: "Package Storage/Shows/2026-10-21/v1.mp4" });
      await unlinkEditorDevice("laptop", NOW);
      expect(mocks.revoke).toHaveBeenCalledWith("laptop", NOW);
      expect(mocks.job.findMany).toHaveBeenCalledWith({ where: { status: "QUEUED", pendingFix: { not: null }, deviceId: { in: ["laptop"] } } });
      const ended = mocks.job.updateMany.mock.calls[0][0];
      expect(ended.where).toEqual({ id: "job1", status: "QUEUED" });
      expect(ended.data).toMatchObject({
        status: "REVIEW", pendingFix: null, error: "The machine that made this edit is no longer linked; use Redo"
      });
    });

    it("a fix can't be asked of an unlinked machine", async () => {
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "REVIEW", deviceId: "gone" }));
      await expect(requestShowFix({ userId: "u1", id: "job1", text: "Fix the card", remember: false }, NOW))
        .rejects.toMatchObject({ status: 409, message: "The machine that made this edit is no longer linked; use Redo" });
    });

    it("a fix for an offline machine waits, and the panel names the machine", async () => {
      mocks.job.findFirst.mockResolvedValue(job({ status: "QUEUED", deviceId: "laptop", pendingFix: "Fix the card" }));
      mocks.devices.mockResolvedValue([machine({}), machine({ id: "laptop", name: "Abby's laptop", active: false, online: false })]);
      expect((await showEditState(SHOW, NOW)).waitingFor).toBe("Abby's laptop");
    });
  });

  describe("auto-publish", () => {
    const out = "Package Storage/Shows/2026-10-21/x.mp4";
    const defaults = { title: "InFocus News", description: "Anchors …", publishDate: SHOW, publishTime: "08:30", seasonNumber: 31, existingSeasons: [31] };
    const clean = { coversClean: true, loudness: [{ segment: "open", ok: true }, { segment: "pkg", ok: true }] };

    it("auto-publishes only when the flag is on and checks pass", async () => {
      mocks.pubState.mockResolvedValue({ defaults });
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: out }));
      await completeShowEdit({ id: "job1", outputNasPath: out, decisions: [], checks: clean, needsReview: false, costUsd: 1, agentSessionId: "s" }, NOW);
      expect(mocks.confirm).not.toHaveBeenCalled();

      vi.stubEnv("SHOW_EDITOR_AUTO_PUBLISH", "1");
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: out }));
      await completeShowEdit({ id: "job1", outputNasPath: out, decisions: [], checks: clean, needsReview: false, costUsd: 1, agentSessionId: "s" }, NOW);
      expect(mocks.confirm).toHaveBeenCalledWith({
        userId: "u1", showDate: SHOW, title: "InFocus News", description: "Anchors …", publishDate: SHOW, publishTime: "08:30", seasonNumber: 31
      });
      expect(mocks.job.update).toHaveBeenLastCalledWith({ where: { id: "job1" }, data: { status: "PUBLISHED" } });
    });

    it("a saved auto-publish setting wins over the env var", async () => {
      vi.stubEnv("SHOW_EDITOR_AUTO_PUBLISH", "1");
      mocks.settings.findUnique.mockResolvedValue({ autoStart: null, autoPublish: false, targetVersion: null, agentOrder: null, houseRules: null, updatedAt: NOW });
      mocks.pubState.mockResolvedValue({ defaults });
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: out }));
      await completeShowEdit({ id: "job1", outputNasPath: out, decisions: [], checks: clean, needsReview: false, costUsd: 1, agentSessionId: "s" }, NOW);
      expect(mocks.confirm).not.toHaveBeenCalled();
    });

    it("stays in REVIEW when any decision is flagged", async () => {
      vi.stubEnv("SHOW_EDITOR_AUTO_PUBLISH", "1");
      mocks.pubState.mockResolvedValue({ defaults });
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: out }));
      await completeShowEdit({
        id: "job1", outputNasPath: out, decisions: [{ kind: "package", detail: "Placeholder", flagged: true }],
        checks: clean, needsReview: true, costUsd: 1, agentSessionId: "s"
      }, NOW);
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), "needs-review");
    });

    it("stays in REVIEW when a loudness check failed", async () => {
      vi.stubEnv("SHOW_EDITOR_AUTO_PUBLISH", "1");
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: out }));
      await completeShowEdit({
        id: "job1", outputNasPath: out, decisions: [], checks: { coversClean: true, loudness: [{ segment: "throw", ok: false }] },
        needsReview: false, costUsd: 1, agentSessionId: "s"
      }, NOW);
      expect(mocks.confirm).not.toHaveBeenCalled();
    });
  });

  describe("approve", () => {
    const out = "Package Storage/Shows/2026-10-21/x.mp4";
    const defaults = {
      title: "InFocus News | Wednesday, October 21st, 2026", description: "Anchors …", publishDate: SHOW, publishTime: "08:30",
      seasonNumber: 31, existingSeasons: [31]
    };
    const draft = { status: "DRAFT", nasPath: out };
    const approve = (now = NOW) => approveShowEdit({ id: "job1", userId: "u2" }, now);

    beforeEach(() => {
      mocks.job.findUnique.mockResolvedValue(job({ status: "REVIEW", outputNasPath: out }));
      mocks.publication.findUnique.mockResolvedValue(draft);
      mocks.pubState.mockResolvedValue({ defaults });
      mocks.confirm.mockResolvedValue(undefined);
      mocks.mint.mockResolvedValue("https://drive.example.org/api/service/file?path=x&token=r.1.x&inline=false");
    });

    it("schedules the draft with Upload show's defaults and marks the edit PUBLISHED", async () => {
      // The draft first; after scheduling, markShowEditPublished reads the sent publication.
      mocks.publication.findUnique.mockResolvedValueOnce(draft).mockResolvedValueOnce({ status: "UPLOADING", nasPath: out });
      await approve();
      expect(mocks.confirm).toHaveBeenCalledWith({
        userId: "u2", showDate: SHOW, title: defaults.title, description: "Anchors …", publishDate: SHOW, publishTime: "08:30", seasonNumber: 31
      });
      expect(mocks.job.updateMany).toHaveBeenCalledWith({ where: { showDate: SHOW, status: "REVIEW", outputNasPath: out }, data: { status: "PUBLISHED" } });
    });

    it("refuses an edit that isn't ready for review, or was already scheduled", async () => {
      mocks.job.findUnique.mockResolvedValue(job({ status: "RUNNING", outputNasPath: out }));
      await expect(approve()).rejects.toMatchObject({ status: 409, message: "An edit can be approved once it's ready for review." });
      mocks.job.findUnique.mockResolvedValue(job({ status: "PUBLISHED", outputNasPath: out }));
      await expect(approve()).rejects.toMatchObject({ status: 409, message: "This edit was already scheduled." });
      expect(mocks.confirm).not.toHaveBeenCalled();
    });

    it("refuses once the show was sent to YouTube, or when the draft is another file", async () => {
      mocks.publication.findUnique.mockResolvedValue({ status: "SCHEDULED", nasPath: out });
      await expect(approve()).rejects.toMatchObject({ status: 409, message: "This show was already sent to YouTube. Make changes in YouTube Studio." });
      mocks.publication.findUnique.mockResolvedValue({ status: "DRAFT", nasPath: "Package Storage/Shows/2026-10-21/upload.mp4" });
      await expect(approve()).rejects.toMatchObject({ status: 409 });
      expect(mocks.confirm).not.toHaveBeenCalled();
    });

    it("without a season it says to pick one under Change details", async () => {
      mocks.pubState.mockResolvedValue({ defaults: { ...defaults, seasonNumber: null } });
      await expect(approve()).rejects.toMatchObject({ status: 409, message: "Pick a season first: use Change details." });
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.job.updateMany).not.toHaveBeenCalled();
    });

    it("once the usual publish time has passed it says so and points to Change details", async () => {
      // 9:00 AM Pacific on the show date, after the 8:30 default.
      await expect(approve(new Date("2026-10-21T16:00:00Z"))).rejects.toMatchObject({
        status: 409, message: "The usual publish time has already passed. Pick a new time: use Change details."
      });
      expect(mocks.confirm).not.toHaveBeenCalled();
    });

    it("a refusal from scheduling comes back as its plain message", async () => {
      mocks.confirm.mockRejectedValue(new ShowUploadError("The show video is not on InFocus Drive yet. Wait for the upload to finish."));
      await expect(approve()).rejects.toMatchObject({ status: 400, message: "The show video is not on InFocus Drive yet. Wait for the upload to finish." });
    });

    it("auto-publish uses the same defaults check: no season, no schedule", async () => {
      vi.stubEnv("SHOW_EDITOR_AUTO_PUBLISH", "1");
      mocks.pubState.mockResolvedValue({ defaults: { ...defaults, seasonNumber: null } });
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: out }));
      const clean = { coversClean: true, loudness: [{ segment: "open", ok: true }] };
      await completeShowEdit({ id: "job1", outputNasPath: out, decisions: [], checks: clean, needsReview: false, costUsd: 1, agentSessionId: "s" }, NOW);
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), "review");
    });

    it("with earliest, a default time sooner than that moves to it (the 8 AM auto-schedule)", async () => {
      // 8:20 AM Pacific on show day: 8:30 is under 15 minutes away, so it publishes at 8:35.
      const late = new Date("2026-10-21T15:20:00Z");
      const publishAt = await scheduleWithDefaults(SHOW, "u1", late, new Date(late.getTime() + 15 * 60_000));
      expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ publishDate: SHOW, publishTime: "08:35" }));
      expect(publishAt.toISOString()).toBe("2026-10-21T15:35:00.000Z");
      // At 8:00 the usual 8:30 is far enough out and stays.
      const early = new Date("2026-10-21T15:00:00Z");
      await scheduleWithDefaults(SHOW, "u1", early, new Date(early.getTime() + 15 * 60_000));
      expect(mocks.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ publishTime: "08:30" }));
    });

    it("an auto-started job keeps that mark when the editor's complete replaces checks", async () => {
      mocks.job.findUnique.mockResolvedValueOnce(job({ status: "RUNNING", outputNasPath: out, checks: { autoStarted: true } }));
      await completeShowEdit({ id: "job1", outputNasPath: out, decisions: [], checks: { coversClean: false }, needsReview: true, costUsd: 1, agentSessionId: "s" }, NOW);
      expect(mocks.job.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ checks: { coversClean: false, autoStarted: true } }) }));
    });

    it("the state previews what Approve will schedule, or why it can't, only for the reviewed draft", async () => {
      mocks.job.findFirst.mockResolvedValue(job({ status: "REVIEW", outputNasPath: out }));
      expect((await showEditState(SHOW, NOW)).approve).toEqual({ title: defaults.title, publishAt: "2026-10-21T15:30:00.000Z", problem: null });
      mocks.pubState.mockResolvedValue({ defaults: { ...defaults, seasonNumber: null } });
      expect((await showEditState(SHOW, NOW)).approve).toMatchObject({ problem: "Pick a season first: use Change details." });
      mocks.publication.findUnique.mockResolvedValue({ status: "DRAFT", nasPath: "Package Storage/Shows/2026-10-21/upload.mp4" });
      expect((await showEditState(SHOW, NOW)).approve).toBeNull();
      mocks.job.findFirst.mockResolvedValue(job({ status: "RUNNING", outputNasPath: out }));
      mocks.publication.findUnique.mockResolvedValue(draft);
      expect((await showEditState(SHOW, NOW)).approve).toBeNull();
    });
  });
});
