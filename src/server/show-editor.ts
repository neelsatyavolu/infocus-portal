import type { Prisma, ShowEditJob } from "@prisma/client";
import { pacificDateKey } from "@/src/lib/meetings/schedule";
import { buildShowNasPath, nasDeriveWebPlaybackUrl, nasMintDownloadUrl, nasPosterPath } from "@/src/lib/nas-storage";
import { prisma } from "@/src/lib/prisma";
import {
  autoPublishReady, LEGACY_EDITOR_DEVICE_ID, SHOW_EDIT_MAX_ATTEMPT, SHOW_EDIT_STALE_MS, SHOW_RECORDINGS_FOLDER,
  UNFINISHED_SHOW_EDIT_STATUSES, type EditorHealth, type ShowEditDecision, type ShowEditMessage, type ShowEditStage,
  type EditorBackendStatus, type ShowEditBackend, type ShowEditorCommandKind, type ShowEditorMachineKind, type ShowEditState, type ShowEditStatus, type ShowEditView,
  type AutoStartPreview, type ShowEditApprovePreview, type ShowRecording
} from "@/src/lib/show-editor";
import { showPublishAt } from "@/src/lib/show-publication";
import { portalChecks, publishSlotNotBefore } from "@/src/lib/show-editor-escalation";
import {
  driveFileSize, editorDriveBaseUrl, listShowRecordings, mintEditorDownload, mintEditorUpload
} from "@/src/server/show-editor-drive";
import { notifyShowEdit, runShowEditAutoStart, showEditAutoStartGroups } from "@/src/server/show-editor-notify";
import {
  applyCredentialAcks, deliverCredentials, pairingStatuses, purgeStaleCiphertext
} from "@/src/server/show-editor-pairing";
import { applyCommandAcks, recentEditorCommands, takePendingCommands } from "@/src/server/show-editor-commands";
import { activateEditorDevice, listEditorDevices, revokeEditorDevice } from "@/src/server/show-editor-link";
import { loadEditorSettings, saveEditorSettings } from "@/src/server/show-editor-settings";
import {
  attachEditedShow, confirmShowPublication, showPublicationState, ShowUploadError
} from "@/src/server/show-publishing";
import { loadShowStory } from "@/src/server/show-story";
import { pastShowCards, type PastShowCard } from "@/src/server/show-editor-past-cards";
import { classRoster } from "@/src/server/show-editor-roster";
import { ShowEditError } from "@/src/server/show-editor-errors";
import {
  briefSources, normalizeSources, sourceSelectionError, type ShowEditBriefSource, type ShowEditSource
} from "@/src/lib/show-editor-sources";
import {
  DEBUG_LOG_LINKS, debugLogsOf, editorLogPath, isEditorLogPath, mergeDebugLog, type ShowEditDebugLog, type ShowEditDebugLogEntry
} from "@/src/lib/show-editor-debug-logs";

export { ShowEditError };

const PREVIEW_TTL_SECONDS = 3 * 3600;
const MACHINE_UNLINKED = "The machine that made this edit is no longer linked; use Redo";
const SENT_TO_YOUTUBE = "This show was already sent to YouTube. Make changes in YouTube Studio.";
const NO_SEASON = "Pick a season first: use Change details.";
const TIME_PASSED = "The usual publish time has already passed. Pick a new time: use Change details.";

export type ShowEditBrief = {
  jobId: string;
  showDate: string;
  filmedOn: string | null;
  version: number;
  /** The recordings and their roles, in the producer's order. */
  sources: ShowEditBriefSource[];
  /** The same paths in order, for editors from before multicam. */
  sourcePaths: string[];
  anchors: string[];
  /** Full names of the class (staff left out), A–Z, at most 300: anchors above are often nicknames. */
  roster: string[];
  announcements: string[];
  /** Announcement cards from other shows' latest edits (`checks.cards`), newest show first, at most 16. */
  pastCards: PastShowCard[];
  packages: { title: string; nasPath: string; toss: string | null }[];
  note: string | null;
  /** The producers' house rules from the Editing tab; null means the editor's built-in default. */
  houseRules: string | null;
  outputNasPath: string;
  posterNasPath: string;
};

export type ShowEditClaim = {
  kind: "edit" | "fix";
  job: { id: string; showDate: string; version: number; attempt: number; status: "RUNNING" };
  brief: ShowEditBrief;
  downloads?: { path: string; url: string; size: number | null }[];
  fix?: { text: string; remember: boolean; agentSessionId: string | null; version: number };
};


function objectChecks(checks: unknown): Record<string, unknown> {
  return checks && typeof checks === "object" && !Array.isArray(checks) ? (checks as Record<string, unknown>) : {};
}

function conversationOf(job: Pick<ShowEditJob, "conversation">): ShowEditMessage[] {
  return Array.isArray(job.conversation) ? (job.conversation as unknown as ShowEditMessage[]) : [];
}

export function showEditView(job: ShowEditJob): ShowEditView {
  return {
    id: job.id,
    showDate: job.showDate,
    sources: normalizeSources(job.sourcePaths),
    status: job.status as ShowEditStatus,
    stage: (job.stage as ShowEditStage | null) ?? null,
    message: job.message,
    note: job.note,
    outputNasPath: job.outputNasPath,
    decisions: Array.isArray(job.decisions) ? (job.decisions as unknown as ShowEditDecision[]) : [],
    checks: job.checks && typeof job.checks === "object" && !Array.isArray(job.checks)
      ? (job.checks as Record<string, unknown>) : null,
    needsReview: job.needsReview,
    costUsd: job.costUsd,
    attempt: job.attempt,
    error: job.error,
    cancelRequested: job.cancelRequested,
    pendingFix: job.pendingFix,
    conversation: conversationOf(job),
    version: job.version,
    debugLogs: debugLogsOf(job.checks).reverse().map(({ version, at }) => ({ version, url: null, at })),
    createdAt: job.createdAt.toISOString(),
    heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null
  };
}

async function requireJob(id: string) {
  const job = await prisma.showEditJob.findUnique({ where: { id } });
  if (!job) throw new ShowEditError("That edit doesn't exist.", 404);
  return job;
}

/** 409 once the show left DRAFT: from then on it is changed in YouTube Studio. */
async function requireShowStillDraft(showDate: string) {
  const publication = await prisma.showPublication.findUnique({ where: { showDate } });
  if (publication && publication.status !== "DRAFT") throw new ShowEditError(SENT_TO_YOUTUBE, 409);
  return publication;
}

async function refuseUnfinishedJob(showDate: string, exceptId?: string) {
  const unfinished = await prisma.showEditJob.findFirst({
    where: { showDate, status: { in: [...UNFINISHED_SHOW_EDIT_STATUSES] }, ...(exceptId ? { id: { not: exceptId } } : {}) }
  });
  if (unfinished) throw new ShowEditError("This show already has an automatic edit. Cancel it or use Redo.", 409);
}

export async function startShowEdit(
  input: { userId: string; showDate: string; sources: ShowEditSource[] }, now = new Date()
): Promise<ShowEditView> {
  const invalid = sourceSelectionError(input.sources);
  if (invalid) throw new ShowEditError(invalid, 400);
  await requireShowStillDraft(input.showDate);
  await refuseUnfinishedJob(input.showDate);
  const listed = new Map((await listShowRecordings(now)).map((recording) => [recording.path, recording]));
  for (const { path } of input.sources) {
    const recording = listed.get(path);
    if (!recording) throw new ShowEditError(`${path} isn't in the ${SHOW_RECORDINGS_FOLDER} folder on Drive.`, 400);
    if (!recording.stable) throw new ShowEditError(`${recording.name} is still copying to Drive. Try again in a few minutes.`, 400);
  }
  const job = await prisma.showEditJob.create({
    data: { showDate: input.showDate, sourcePaths: input.sources, createdById: input.userId }
  });
  return showEditView(job);
}

/**
 * Data that ends a run that didn't finish. A failed or cancelled fix goes back to REVIEW on the
 * version the show's draft still points at; anything else ends FAILED or CANCELLED.
 */
async function endedRunData(job: ShowEditJob, error: string, cancelled: boolean, now: Date): Promise<Prisma.ShowEditJobUpdateInput> {
  const common = { stage: null, message: null, cancelRequested: false, finishedAt: now };
  if (job.pendingFix) {
    const publication = await prisma.showPublication.findUnique({ where: { showDate: job.showDate } });
    const current = publication?.nasPath ?? job.outputNasPath;
    const reply: ShowEditMessage = {
      from: "editor",
      text: cancelled ? "Fix cancelled. The show is unchanged." : `Couldn't apply this fix: ${error}`,
      at: now.toISOString()
    };
    return {
      ...common, status: "REVIEW", pendingFix: null, rememberFix: false, error: cancelled ? null : error,
      outputNasPath: current, posterNasPath: current ? nasPosterPath(current) : null,
      conversation: [...conversationOf(job), reply] as unknown as Prisma.InputJsonValue
    };
  }
  return { ...common, status: cancelled ? "CANCELLED" : "FAILED", error: cancelled ? null : error };
}

export async function cancelShowEdit(input: { id: string }, now = new Date()): Promise<ShowEditView> {
  const job = await requireJob(input.id);
  if (job.status === "QUEUED") {
    await prisma.showEditJob.updateMany({
      where: { id: job.id, status: "QUEUED" }, data: await endedRunData(job, "Cancelled", true, now) as Prisma.ShowEditJobUpdateManyMutationInput
    });
  } else if (job.status === "RUNNING") {
    await prisma.showEditJob.update({ where: { id: job.id }, data: { cancelRequested: true } });
  } else {
    throw new ShowEditError("Only a waiting or running edit can be cancelled.", 409);
  }
  return showEditView(await requireJob(job.id).catch(() => job));
}

export async function redoShowEdit(input: { userId: string; id: string; note?: string }, now = new Date()): Promise<ShowEditView> {
  const old = await requireJob(input.id);
  if (!["REVIEW", "FAILED", "CANCELLED"].includes(old.status)) {
    throw new ShowEditError("Redo is for an edit that finished, failed or was cancelled.", 409);
  }
  await requireShowStillDraft(old.showDate);
  await refuseUnfinishedJob(old.showDate, old.id);
  if (old.status === "REVIEW") {
    await prisma.showEditJob.updateMany({
      where: { id: old.id, status: "REVIEW" }, data: { status: "CANCELLED", message: "Replaced by a redo.", finishedAt: now }
    });
  }
  const job = await prisma.showEditJob.create({
    data: { showDate: old.showDate, sourcePaths: normalizeSources(old.sourcePaths), note: input.note?.trim() || null, createdById: input.userId }
  });
  return showEditView(job);
}

/** Remote prompting: a producer's fix goes back to the same agent session as the next version. */
export async function requestShowFix(
  input: { userId: string; id: string; text: string; remember: boolean }, now = new Date()
): Promise<ShowEditView> {
  const text = input.text.trim();
  if (!text || text.length > 1000) throw new ShowEditError("Describe the fix in 1–1000 characters.", 400);
  const job = await requireJob(input.id);
  if (job.status !== "REVIEW") throw new ShowEditError("Fixes can be asked for once the edit is ready for review.", 409);
  await requireShowStillDraft(job.showDate);
  // A fix runs where the edit's files are; once that machine is unlinked only Redo can help.
  if (job.deviceId && !(await prisma.showEditorDevice.findFirst({ where: { id: job.deviceId, revokedAt: null }, select: { id: true } }))) {
    throw new ShowEditError(MACHINE_UNLINKED, 409);
  }
  const message: ShowEditMessage = { from: "producer", text, at: now.toISOString() };
  const updated = await prisma.showEditJob.updateMany({
    where: { id: job.id, status: "REVIEW" },
    data: {
      status: "QUEUED", pendingFix: text, rememberFix: input.remember, cancelRequested: false, error: null,
      stage: null, message: null, attempt: 0,
      conversation: [...conversationOf(job), message] as unknown as Prisma.InputJsonValue
    }
  });
  if (updated.count === 0) throw new ShowEditError("This edit changed. Reload and try again.", 409);
  return showEditView(await requireJob(job.id).catch(() => ({ ...job, status: "QUEUED", pendingFix: text })));
}

export type HeartbeatInput = {
  /** The machine that sent it (the legacy SHOW_EDITOR_TOKEN is the machine "legacy"). */
  deviceId: string;
  version: string;
  busy: boolean;
  health: EditorHealth;
  machine?: { name: string; kind: ShowEditorMachineKind };
  publicKey?: string;
  backends?: EditorBackendStatus[];
  credentialAcks?: { id: string; ok: boolean; error?: string }[];
  commandAcks?: { id: string; ok: boolean; output?: string }[];
};

/** Each machine's heartbeat: its own state, cancel requests, sign-ins and commands, and whether it's the active editor. */
export async function recordHeartbeat(input: HeartbeatInput, now = new Date()): Promise<{
  active: boolean;
  cancelJobIds: string[];
  targetVersion: string | null;
  credentials: { id: string; backend: ShowEditBackend; ciphertext: string }[];
  settings: { agentOrder: ShowEditBackend[]; targetVersion: string | null };
  commands: { id: string; kind: ShowEditorCommandKind }[];
}> {
  const { deviceId } = input;
  const device = await prisma.showEditorDevice.update({
    where: { id: deviceId },
    data: {
      lastSeenAt: now, version: input.version, busy: input.busy, health: input.health,
      ...(input.publicKey ? { publicKey: input.publicKey } : {}),
      ...(input.backends ? { backends: input.backends as unknown as Prisma.InputJsonValue } : {}),
      // The legacy machine keeps its name, so producers can tell it apart.
      ...(input.machine ? { kind: input.machine.kind, ...(deviceId === LEGACY_EDITOR_DEVICE_ID ? {} : { name: input.machine.name }) } : {})
    }
  });
  let active = device.active;
  if (!active && (await prisma.showEditorDevice.count({ where: { active: true, revokedAt: null } })) === 0) {
    // Nothing is active (first link, or the active machine was unlinked): this machine takes over.
    await activateEditorDevice(deviceId);
    active = true;
  }
  // While a machine is busy, its heartbeat keeps its own running job from looking stale.
  if (input.busy) await prisma.showEditJob.updateMany({ where: { status: "RUNNING", deviceId }, data: { heartbeatAt: now } });
  const cancelled = await prisma.showEditJob.findMany({ where: { status: "RUNNING", deviceId, cancelRequested: true }, select: { id: true } });
  // Acks first, so an installed sign-in is never handed over again; then drop anything over an hour old.
  await applyCredentialAcks(input.credentialAcks ?? [], deviceId);
  await purgeStaleCiphertext(now);
  const credentials = await deliverCredentials(deviceId, input.publicKey ?? device.publicKey, now);
  await applyCommandAcks(input.commandAcks ?? [], deviceId, now);
  const [settings, commands] = await Promise.all([loadEditorSettings(), takePendingCommands(deviceId, now)]);
  if (settings.autoStart) {
    try {
      await runShowEditAutoStart(now);
    } catch (error) {
      console.error("show editor: auto-start failed", error);
    }
  }
  return {
    active,
    cancelJobIds: cancelled.map((job) => job.id),
    // A release tag (e.g. "v0.3.1") pins or rolls back the editor; null lets it follow the newest release.
    targetVersion: settings.targetVersion,
    credentials,
    settings: { agentOrder: settings.agentOrder, targetVersion: settings.targetVersion },
    commands
  };
}

/**
 * RUNNING jobs whose machine went quiet go back to the queue, or fail after the last attempt. A requeued
 * edit is free for whichever machine is active; a requeued fix waits for the machine that has its files.
 */
async function requeueStaleJobs(now: Date) {
  const cutoff = new Date(now.getTime() - SHOW_EDIT_STALE_MS);
  const stale = await prisma.showEditJob.findMany({
    where: { status: "RUNNING", OR: [{ heartbeatAt: { lt: cutoff } }, { heartbeatAt: null, claimedAt: { lt: cutoff } }] }
  });
  for (const job of stale) {
    if (job.attempt >= SHOW_EDIT_MAX_ATTEMPT) {
      const data = await endedRunData(job, "The editing machine stopped responding.", false, now);
      const ended = await prisma.showEditJob.updateMany({ where: { id: job.id, status: "RUNNING" }, data: data as Prisma.ShowEditJobUpdateManyMutationInput });
      if (ended.count > 0 && data.status === "FAILED") await notifyShowEdit({ ...job, status: "FAILED", error: "The editing machine stopped responding." }, "failed");
    } else {
      await prisma.showEditJob.updateMany({
        where: { id: job.id, status: "RUNNING" },
        data: {
          status: "QUEUED", attempt: job.attempt + 1, stage: null, message: "Waiting for the editing machine to come back.",
          claimedAt: null, heartbeatAt: null, ...(job.pendingFix ? {} : { deviceId: null })
        }
      });
    }
  }
}

/** Queued fixes whose machine was unlinked can never run (the job folder was there): they fail with the Redo message. */
async function failOrphanedFixes(now: Date, deviceIds?: string[]) {
  const unlinked = deviceIds ?? (await prisma.showEditorDevice.findMany({ where: { revokedAt: { not: null } }, select: { id: true } })).map((row) => row.id);
  if (unlinked.length === 0) return;
  const orphans = await prisma.showEditJob.findMany({ where: { status: "QUEUED", pendingFix: { not: null }, deviceId: { in: unlinked } } });
  for (const job of orphans) {
    const data = await endedRunData(job, MACHINE_UNLINKED, false, now);
    await prisma.showEditJob.updateMany({ where: { id: job.id, status: "QUEUED" }, data: data as Prisma.ShowEditJobUpdateManyMutationInput });
  }
}

/** Producer "Unlink": revoke the machine and fail fixes that were waiting for it. */
export async function unlinkEditorDevice(deviceId: string, now = new Date()) {
  const result = await revokeEditorDevice(deviceId, now);
  await failOrphanedFixes(now, [deviceId]);
  return result;
}

function outputPaths(showDate: string, now: Date) {
  const outputNasPath = buildShowNasPath({ showDate, fileName: `InFocus Show ${showDate}.mp4`, stamp: now.getTime().toString(36) });
  return { outputNasPath, posterNasPath: nasPosterPath(outputNasPath) };
}

async function queuedPackages(showDate: string) {
  const rows = await prisma.packageProgressRow.findMany({
    where: { queuedForAirAt: { not: null }, queuedForShowDate: showDate },
    select: { groupTopic: true, finalCutToss: true, finalCutMediaItem: { select: { title: true, currentVersion: { select: { nasPath: true } } } } },
    orderBy: { queuedForAirAt: "asc" }
  });
  return rows.flatMap((row) => {
    const nasPath = row.finalCutMediaItem?.currentVersion?.nasPath;
    if (!nasPath) return [];
    const toss = row.finalCutToss.trim();
    return [{ title: row.finalCutMediaItem?.title?.trim() || row.groupTopic.trim(), nasPath, toss: toss || null }];
  });
}

async function buildClaim(job: ShowEditJob, paths: { outputNasPath: string; posterNasPath: string }, now: Date): Promise<ShowEditClaim> {
  const kind = job.pendingFix ? "fix" : "edit";
  const version = kind === "fix" ? job.version + 1 : job.version;
  const sources = briefSources(normalizeSources(job.sourcePaths));
  // Ignored files stay in `sources` (so the editor can say so) but are never downloaded, and older editors never see them.
  const sourcePaths = sources.filter((source) => source.role !== "ignore").map((source) => source.path);
  const [story, packages, settings, recordings, pastCards, roster] = await Promise.all([
    loadShowStory(job.showDate),
    queuedPackages(job.showDate),
    loadEditorSettings(),
    kind === "edit" ? listShowRecordings(now) : Promise.resolve([] as ShowRecording[]),
    pastShowCards(job.showDate),
    classRoster()
  ]);
  const listed = new Map(recordings.map((recording) => [recording.path, recording]));
  const timedSources = kind === "edit"
    ? sources.map((source) => ({ ...source, modifiedAt: listed.get(source.path)?.modifiedAt ?? null }))
    : sources;
  const first = listed.get(sourcePaths[0] ?? "");
  const brief: ShowEditBrief = {
    jobId: job.id,
    showDate: job.showDate,
    filmedOn: first ? pacificDateKey(new Date(first.modifiedAt)) : null,
    version,
    sources: timedSources,
    sourcePaths,
    anchors: story.anchors,
    roster,
    announcements: story.announcements,
    pastCards,
    packages,
    note: job.note,
    houseRules: settings.houseRules,
    ...paths
  };
  const claimed = { id: job.id, showDate: job.showDate, version, attempt: job.attempt, status: "RUNNING" as const };
  if (kind === "fix") {
    return {
      kind, job: claimed, brief,
      fix: { text: job.pendingFix ?? "", remember: job.rememberFix, agentSessionId: job.agentSessionId, version }
    };
  }
  const downloads = await Promise.all([
    ...sourcePaths.map(async (path) => ({ path, url: await mintEditorDownload(path), size: listed.get(path)?.size ?? null })),
    ...packages.map(async (pkg) => ({ path: pkg.nasPath, url: await mintEditorDownload(pkg.nasPath), size: await driveFileSize(pkg.nasPath) }))
  ]);
  return { kind, job: claimed, brief, downloads };
}

const CLAIM_TRIES = 5;

/**
 * The active machine gets new edits and fixes for its own jobs; any other machine only gets fixes for
 * jobs it edited (their files are on it). The job remembers which machine claimed it.
 */
export async function claimNextShowEdit(deviceId: string, now = new Date()): Promise<ShowEditClaim | null> {
  await requeueStaleJobs(now);
  await failOrphanedFixes(now);
  const device = await prisma.showEditorDevice.findFirst({ where: { id: deviceId, revokedAt: null }, select: { active: true } });
  if (!device) return null;
  const where: Prisma.ShowEditJobWhereInput = device.active
    ? { status: "QUEUED", OR: [{ deviceId: null }, { deviceId }] }
    : { status: "QUEUED", deviceId, pendingFix: { not: null } };
  for (let tries = 0; tries < CLAIM_TRIES; tries += 1) {
    const job = await prisma.showEditJob.findFirst({ where, orderBy: { createdAt: "asc" } });
    if (!job) return null;
    const paths = outputPaths(job.showDate, now);
    // Built before the claim, so a Drive or database hiccup leaves the job queued instead of stuck RUNNING.
    const claim = await buildClaim(job, paths, now);
    const won = await prisma.showEditJob.updateMany({
      where: { id: job.id, status: "QUEUED" },
      data: {
        status: "RUNNING", deviceId, claimedAt: now, heartbeatAt: now, stage: null, message: null, error: null,
        cancelRequested: false, ...paths
      }
    });
    if (won.count > 0) return claim;
  }
  return null;
}

export async function reportShowEditProgress(
  input: { id: string; stage: ShowEditStage; message: string }, now = new Date()
): Promise<{ cancel: boolean }> {
  const job = await requireJob(input.id);
  // Requeued or ended while the Mac was still working on it: tell the Mac to stop.
  if (job.status !== "RUNNING") return { cancel: true };
  await prisma.showEditJob.update({ where: { id: job.id }, data: { stage: input.stage, message: input.message, heartbeatAt: now } });
  return { cancel: job.cancelRequested };
}

async function requireRunning(id: string) {
  const job = await requireJob(id);
  if (job.status !== "RUNNING") throw new ShowEditError("This edit is no longer running.", 409);
  return job;
}

/** The timeline version a run produces: a fix makes the next one. */
function runVersion(job: ShowEditJob) {
  return job.pendingFix ? job.version + 1 : job.version;
}

/** This run's debug bundle path; the stamp is the claim time, the same stamp as the run's output file. */
function runLogPath(job: ShowEditJob, now: Date) {
  const stamp = (job.claimedAt ?? now).getTime().toString(36);
  return editorLogPath({ showDate: job.showDate, jobId: job.id, version: runVersion(job), stamp });
}

/** The bundle a complete/fail reports, checked against this job (400 otherwise); null when none was sent. */
function debugLogEntry(job: ShowEditJob, path: string | undefined, now: Date): ShowEditDebugLogEntry | null {
  if (path === undefined) return null;
  if (!isEditorLogPath(path, job.showDate, job.id)) throw new ShowEditError("debugLogPath isn't this edit's debug log path.", 400);
  return { version: runVersion(job), path, at: now.toISOString() };
}

export async function showEditUploadTargets(id: string, now = new Date()) {
  const job = await requireRunning(id);
  if (!job.outputNasPath || !job.posterNasPath) throw new ShowEditError("This edit has no output path yet.", 409);
  const [video, poster, log] = await Promise.all([
    mintEditorUpload(job.outputNasPath), mintEditorUpload(job.posterNasPath), mintEditorUpload(runLogPath(job, now))
  ]);
  return { driveBaseUrl: editorDriveBaseUrl(), video, poster, log };
}

type ScheduleDefaults = NonNullable<Awaited<ReturnType<typeof showPublicationState>>["defaults"]>;

/** Why Upload show's defaults can't be scheduled as they are (no season, or the time has passed); null when they can. */
function defaultsProblem(defaults: ScheduleDefaults, now: Date) {
  if (!defaults.seasonNumber) return NO_SEASON;
  if (showPublishAt(defaults.publishDate, defaults.publishTime).getTime() <= now.getTime()) return TIME_PASSED;
  return null;
}

/** The defaults, moved to `earliest` when their time is sooner (the 8 AM auto-schedule). */
function notBefore(defaults: ScheduleDefaults, earliest: Date | undefined): ScheduleDefaults {
  if (!earliest || showPublishAt(defaults.publishDate, defaults.publishTime).getTime() >= earliest.getTime()) return defaults;
  return { ...defaults, ...publishSlotNotBefore(earliest) };
}

/**
 * Schedules the show's draft with Upload show's defaults (auto-publish, Approve, and the 8 AM auto-schedule
 * with `earliest`); returns the publish time. Refusals are plain ShowEditErrors.
 */
export async function scheduleWithDefaults(showDate: string, userId: string, now: Date, earliest?: Date) {
  const { defaults: usual } = await showPublicationState(showDate);
  if (!usual) throw new ShowEditError(SENT_TO_YOUTUBE, 409);
  const defaults = notBefore(usual, earliest);
  const problem = defaultsProblem(defaults, now);
  const { title, description, publishDate, publishTime, seasonNumber } = defaults;
  if (problem || !seasonNumber) throw new ShowEditError(problem ?? NO_SEASON, 409);
  try {
    await confirmShowPublication({ userId, showDate, title, description, publishDate, publishTime, seasonNumber });
  } catch (error) {
    if (error instanceof ShowUploadError) throw new ShowEditError(error.message, error.status);
    throw error;
  }
  return showPublishAt(publishDate, publishTime);
}

/** Phase 2 (SHOW_EDITOR_AUTO_PUBLISH=1): schedule a clean edit with the upload dialog's defaults. */
async function autoPublish(job: ShowEditJob, input: { needsReview: boolean; checks: unknown }, now: Date) {
  if (!autoPublishReady(input) || !(await loadEditorSettings()).autoPublish) return false;
  try {
    await scheduleWithDefaults(job.showDate, job.createdById, now);
    return true;
  } catch (error) {
    console.error("show editor: auto-publish skipped", job.id, error);
    return false;
  }
}

export async function completeShowEdit(input: {
  id: string; outputNasPath: string; decisions: ShowEditDecision[]; checks: Record<string, unknown>;
  needsReview: boolean; costUsd: number; agentSessionId: string; reply?: string;
  /** The full updated house rules after a remembered fix. */
  houseRules?: string;
  debugLogPath?: string;
}, now = new Date()) {
  const job = await requireRunning(input.id);
  if (input.outputNasPath !== job.outputNasPath) throw new ShowEditError("outputNasPath doesn't match this run's brief.", 409);
  const isFix = Boolean(job.pendingFix);
  if (isFix && !input.reply?.trim()) throw new ShowEditError("A fix needs a reply saying what changed.", 400);
  const debugLog = debugLogEntry(job, input.debugLogPath, now);
  try {
    await attachEditedShow({ userId: job.createdById, showDate: job.showDate, nasPath: input.outputNasPath });
  } catch (error) {
    if (error instanceof ShowUploadError) throw new ShowEditError(error.message, error.status);
    throw error;
  }
  const version = isFix ? job.version + 1 : job.version;
  const data: Prisma.ShowEditJobUpdateInput = {
    status: "REVIEW", stage: null, message: null, error: null, cancelRequested: false, finishedAt: now,
    decisions: input.decisions as unknown as Prisma.InputJsonValue,
    checks: { ...mergeDebugLog(job.checks, input.checks, debugLog), ...portalChecks(job.checks) } as Prisma.InputJsonValue,
    needsReview: input.needsReview,
    costUsd: (job.costUsd ?? 0) + input.costUsd,
    agentSessionId: input.agentSessionId,
    ...(isFix
      ? {
          pendingFix: null, rememberFix: false, version,
          conversation: [...conversationOf(job), { from: "editor", text: input.reply!.trim(), at: now.toISOString(), version }] as unknown as Prisma.InputJsonValue
        }
      : {})
  };
  const updated = await prisma.showEditJob.update({ where: { id: job.id }, data });
  if (input.houseRules?.trim()) await saveEditorSettings({ houseRules: input.houseRules }, null);
  const reviewed = { ...job, ...updated, needsReview: input.needsReview };
  if (await autoPublish(job, input, now)) {
    await prisma.showEditJob.update({ where: { id: job.id }, data: { status: "PUBLISHED" } });
    await notifyShowEdit({ ...reviewed, status: "PUBLISHED" }, "published");
  } else {
    await notifyShowEdit(reviewed, input.needsReview ? "needs-review" : "review");
  }
  return { ok: true as const };
}

export async function failShowEdit(input: { id: string; error: string; cancelled: boolean; debugLogPath?: string }, now = new Date()) {
  const job = await requireJob(input.id);
  const debugLog = debugLogEntry(job, input.debugLogPath, now);
  const checks = () => mergeDebugLog(job.checks, objectChecks(job.checks), debugLog) as Prisma.InputJsonValue;
  if (job.status !== "RUNNING" && job.status !== "QUEUED") {
    // Already ended (e.g. timed out): still keep the bundle downloadable.
    if (debugLog) await prisma.showEditJob.update({ where: { id: job.id }, data: { checks: checks() } });
    return { ok: true as const };
  }
  const data = {
    ...await endedRunData(job, input.error.trim() || "The edit failed.", input.cancelled, now),
    ...(debugLog ? { checks: checks() } : {})
  };
  const updated = await prisma.showEditJob.update({ where: { id: job.id }, data });
  if (data.status === "FAILED") await notifyShowEdit({ ...job, ...updated, status: "FAILED", error: input.error }, "failed");
  return { ok: true as const };
}

/** Scheduling the edited draft in the upload dialog finishes its job. */
export async function markShowEditPublished(showDate: string) {
  const publication = await prisma.showPublication.findUnique({ where: { showDate } });
  if (!publication || publication.status === "DRAFT") return;
  await prisma.showEditJob.updateMany({
    where: { showDate, status: "REVIEW", outputNasPath: publication.nasPath }, data: { status: "PUBLISHED" }
  });
}

type DraftPublication = { status: string; nasPath: string } | null;

/** At REVIEW, with the edited file as the show's draft: the edit Approve and the preview are for. */
export function isReviewedDraft(job: ShowEditJob | null, publication: DraftPublication): job is ShowEditJob {
  return job?.status === "REVIEW" && publication?.status === "DRAFT" && Boolean(job.outputNasPath) && publication.nasPath === job.outputNasPath;
}

/** Approve & schedule: schedule the edited draft with Upload show's defaults, which finishes the job. */
export async function approveShowEdit(input: { id: string; userId: string }, now = new Date()): Promise<ShowEditView> {
  const job = await requireJob(input.id);
  if (job.status === "PUBLISHED") throw new ShowEditError("This edit was already scheduled.", 409);
  if (job.status !== "REVIEW") throw new ShowEditError("An edit can be approved once it's ready for review.", 409);
  const publication = await requireShowStillDraft(job.showDate);
  if (!isReviewedDraft(job, publication)) throw new ShowEditError("This edit is no longer the show's video. Reload and try again.", 409);
  await scheduleWithDefaults(job.showDate, input.userId, now);
  // Scheduled is what counts; never fail the approval over the job's own status.
  await markShowEditPublished(job.showDate).catch((error) => console.error("show editor: mark published failed", job.id, error));
  return showEditView(await requireJob(job.id).catch(() => ({ ...job, status: "PUBLISHED" })));
}

/** What Approve would schedule, with the same check as approving; null if the defaults can't be read. */
async function approvePreview(job: ShowEditJob | null, publication: DraftPublication, now: Date): Promise<ShowEditApprovePreview | null> {
  if (!isReviewedDraft(job, publication)) return null;
  try {
    const { defaults } = await showPublicationState(job.showDate);
    if (!defaults) return null;
    const publishAt = showPublishAt(defaults.publishDate, defaults.publishTime).toISOString();
    return { title: defaults.title, publishAt, problem: defaultsProblem(defaults, now) };
  } catch (error) {
    console.error("show editor: approve preview failed", job.id, error);
    return null;
  }
}

async function previewFor(job: ShowEditJob | null, publication: DraftPublication) {
  if (!isReviewedDraft(job, publication) || !job.outputNasPath) return null;
  try {
    const [video, poster] = await Promise.all([
      nasMintDownloadUrl(job.outputNasPath, PREVIEW_TTL_SECONDS),
      job.posterNasPath ? nasMintDownloadUrl(job.posterNasPath, PREVIEW_TTL_SECONDS).catch(() => null) : Promise.resolve(null)
    ]);
    return { videoUrl: nasDeriveWebPlaybackUrl(video), posterUrl: poster };
  } catch (error) {
    console.error("show editor: preview link failed", job.id, error);
    return null;
  }
}

/**
 * Read links (6 h) for the newest few bundles. Skipped while a run is going, so the 10-second poll
 * doesn't mint tokens nobody is shown; a link that can't be minted stays null.
 */
async function debugLogLinks(job: ShowEditJob): Promise<ShowEditDebugLog[]> {
  const logs = debugLogsOf(job.checks).reverse();
  const active = job.status === "QUEUED" || job.status === "RUNNING";
  return Promise.all(logs.map(async ({ version, path, at }, index) => {
    if (active || index >= DEBUG_LOG_LINKS) return { version, url: null, at };
    const url = await mintEditorDownload(path).catch((error) => {
      console.error("show editor: debug log link failed", job.id, error);
      return null;
    });
    return { version, url, at };
  }));
}

export async function showEditState(showDate: string, now = new Date()): Promise<ShowEditState> {
  const [devices, job, publication, settings, pairings] = await Promise.all([
    listEditorDevices(now),
    prisma.showEditJob.findFirst({ where: { showDate }, orderBy: { createdAt: "desc" } }),
    prisma.showPublication.findUnique({ where: { showDate } }),
    loadEditorSettings(),
    pairingStatuses(now)
  ]);
  let recordings: ShowRecording[] = [];
  let recordingsError: string | null = null;
  try {
    recordings = await listShowRecordings(now);
  } catch (error) {
    console.error("show editor: Drive listing failed", error);
    recordingsError = "Couldn't read the Shows folder on Drive.";
  }
  const active = devices.find((device) => device.active) ?? null;
  const autoStart = settings.autoStart && !job ? autoStartPreview(showDate, recordings, now) : null;
  const fixMachine = job?.status === "QUEUED" && job.pendingFix && job.deviceId ? devices.find((device) => device.id === job.deviceId) : undefined;
  const [preview, approve] = await Promise.all([previewFor(job, publication), approvePreview(job, publication, now)]);
  return {
    worker: {
      online: active?.online ?? false,
      lastSeenAt: active?.lastSeenAt ?? null,
      busy: active?.busy ?? false,
      version: active?.version ?? null,
      health: active?.health ?? null
    },
    devices,
    waitingFor: fixMachine && !fixMachine.online ? fixMachine.name : null,
    settings,
    commands: await recentEditorCommands(devices.map((device) => device.id)),
    pairings,
    recordings,
    recordingsError,
    job: job ? { ...showEditView(job), debugLogs: await debugLogLinks(job) } : null,
    publicationStatus: publication?.status ?? null,
    preview,
    approve,
    autoStart
  };
}

/** The panel's auto-start note: the recordings auto-start would use for this show, and when they'll have settled. */
function autoStartPreview(showDate: string, recordings: ShowRecording[], now: Date): AutoStartPreview | null {
  const group = showEditAutoStartGroups(recordings, now).find((entry) => entry.showDate === showDate);
  if (!group) return null;
  const files = group.files.map((file) => ({ path: file.path, role: "auto" as const }));
  return { files, ready: group.ready, readyAt: group.ready ? null : group.readyAt, error: sourceSelectionError(files) };
}
