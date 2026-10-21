/**
 * Automatic show editing (client-safe): statuses, limits, views and the small rules the server
 * and the panel share. Server logic lives in src/server/show-editor.ts; the editing Mac is the
 * infocus-editor project, which polls /api/service/show-editor/*.
 */

export const SHOW_EDIT_STATUSES = ["QUEUED", "RUNNING", "REVIEW", "PUBLISHED", "FAILED", "CANCELLED"] as const;
export type ShowEditStatus = (typeof SHOW_EDIT_STATUSES)[number];

/** Jobs that block starting another edit of the same show. */
export const UNFINISHED_SHOW_EDIT_STATUSES: readonly ShowEditStatus[] = ["QUEUED", "RUNNING", "REVIEW"];

export const SHOW_EDIT_STAGES = ["download", "analyze", "graphics", "audio", "build", "render", "check", "upload", "fix"] as const;
export type ShowEditStage = (typeof SHOW_EDIT_STAGES)[number];

export const SHOW_EDIT_STAGE_LABELS: Record<ShowEditStage, string> = {
  download: "Downloading the recording",
  analyze: "Finding the takes",
  graphics: "Making fresh graphics",
  audio: "Levelling the audio",
  build: "Building the timeline",
  render: "Rendering",
  check: "Checking the render",
  upload: "Uploading to Drive",
  fix: "Applying the fix"
};

/** Folder (Drive share path) the switcher's recordings land in. */
export const SHOW_RECORDINGS_FOLDER = "Shows";
export const MAX_SHOW_EDIT_SOURCES = 4;
export const SHOW_EDIT_NOTE_MAX = 500;
export const SHOW_EDIT_FIX_MAX = 1000;
/** A recording whose size or time changed this recently may still be copying to the NAS. */
export const RECORDING_STABLE_MS = 2 * 60_000;
/** RUNNING with no heartbeat or progress for this long: the Mac slept or went away. */
export const SHOW_EDIT_STALE_MS = 15 * 60_000;
/** A stale job is retried until this many attempts have been used, then it fails. */
export const SHOW_EDIT_MAX_ATTEMPT = 2;
export const EDITOR_ONLINE_MS = 3 * 60_000;
export const MAX_LISTED_RECORDINGS = 30;

const RECORDING_EXTENSIONS = /\.(mov|mp4)$/i;

export type ShowRecording = {
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
  /** Unchanged for RECORDING_STABLE_MS, so it has finished copying. */
  stable: boolean;
};

export type DriveListItem = { name: string; path: string; isDir: boolean; size: number; mtime: string };

export type ShowEditDecision = { kind: string; detail: string; flagged: boolean };

export type ShowEditMessage = { from: "producer" | "editor"; text: string; at: string; version?: number };

export type EditorHealth = { ok: boolean; problems: string[] };

export type ShowEditView = {
  id: string;
  showDate: string;
  sourcePaths: string[];
  status: ShowEditStatus;
  stage: ShowEditStage | null;
  message: string | null;
  note: string | null;
  outputNasPath: string | null;
  decisions: ShowEditDecision[];
  checks: Record<string, unknown> | null;
  needsReview: boolean;
  costUsd: number | null;
  attempt: number;
  error: string | null;
  cancelRequested: boolean;
  pendingFix: string | null;
  conversation: ShowEditMessage[];
  version: number;
  createdAt: string;
  heartbeatAt: string | null;
  finishedAt: string | null;
};

export type ShowEditWorker = {
  online: boolean;
  lastSeenAt: string | null;
  busy: boolean;
  version: string | null;
  health: EditorHealth | null;
};

/** AI subscriptions the editor can run on (signed in on someone's computer, never an API key). */
export const SHOW_EDIT_BACKENDS = ["claude", "codex", "grok"] as const;
export type ShowEditBackend = (typeof SHOW_EDIT_BACKENDS)[number];
export const SHOW_EDIT_BACKEND_LABELS: Record<ShowEditBackend, string> = { claude: "Claude", codex: "Codex", grok: "Grok" };

/** What the Mac reports for each backend in its heartbeat. */
export type EditorBackendStatus = { name: ShowEditBackend; connected: boolean; detail: string };

/** The latest "Connect AI account" code for one backend. */
export type PairingStatus = {
  deviceId: string;
  backend: ShowEditBackend;
  status: "waiting" | "sent" | "connected" | "failed";
  error: string | null;
  expiresAt: string;
};

/** No 0/O, 1/I/L: the code is read off one screen and typed on another. */
export const PAIRING_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_TTL_MS = 10 * 60_000;
/** Sealed sign-ins the Mac hasn't acknowledged are deleted after this long. */
export const PAIRING_CIPHERTEXT_TTL_MS = 60 * 60_000;
export const PAIRING_CIPHERTEXT_MAX = 65_536;

/** "ABCD2345" → "ABCD-2345". */
export function formatPairingCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** What someone typed → the 8 bare characters, or null when it can't be a code. */
export function normalizePairingCode(input: string) {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== PAIRING_CODE_LENGTH) return null;
  return [...code].every((char) => PAIRING_CODE_ALPHABET.includes(char)) ? code : null;
}

/** Remote commands producers can send the editing Mac. */
export const SHOW_EDITOR_COMMANDS = ["doctor", "update", "restart", "repair", "logs"] as const;
export type ShowEditorCommandKind = (typeof SHOW_EDITOR_COMMANDS)[number];
export const SHOW_EDITOR_COMMAND_LABELS: Record<ShowEditorCommandKind, string> = {
  doctor: "Run health check",
  update: "Update now",
  restart: "Restart",
  repair: "Repair",
  logs: "Show log"
};
export const SHOW_EDITOR_COMMAND_OUTPUT_MAX = 4000;
export const SHOW_EDITOR_COMMAND_HISTORY = 20;

export type ShowEditorCommandView = {
  id: string;
  deviceId: string;
  kind: ShowEditorCommandKind;
  status: "PENDING" | "SENT" | "DONE" | "FAILED";
  output: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export const SHOW_EDITOR_HOUSE_RULES_MAX = 20_000;
export const SHOW_EDITOR_VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;
export const LINK_TTL_MS = 15 * 60_000;
export const LINK_POLL_INTERVAL_S = 5;

/** What producers set on The Show; null means "use the SHOW_EDITOR_* env fallback". */
export type ShowEditorSettingsView = {
  autoStart: boolean;
  autoPublish: boolean;
  targetVersion: string | null;
  agentOrder: ShowEditBackend[];
  /** The saved rules, or null while the editor uses its built-in default. */
  houseRules: string | null;
  updatedAt: string | null;
};

export const SHOW_EDITOR_MACHINE_KINDS = ["dedicated", "personal"] as const;
export type ShowEditorMachineKind = (typeof SHOW_EDITOR_MACHINE_KINDS)[number];
/** The legacy SHOW_EDITOR_TOKEN counts as a machine with this id and name. */
export const LEGACY_EDITOR_DEVICE_ID = "legacy";

/** One linked editing machine, as the panel shows it. */
export type ShowEditorDeviceView = {
  id: string;
  name: string;
  kind: ShowEditorMachineKind;
  active: boolean;
  online: boolean;
  linkedAt: string;
  lastSeenAt: string | null;
  version: string | null;
  busy: boolean;
  health: EditorHealth | null;
  backends: EditorBackendStatus[];
};

export type ShowEditState = {
  /** The active machine's status (offline when there is none). */
  worker: ShowEditWorker;
  /** Every linked machine, active first. */
  devices: ShowEditorDeviceView[];
  /** A queued fix waiting for the (offline) machine that made the edit. */
  waitingFor: string | null;
  settings: ShowEditorSettingsView;
  commands: ShowEditorCommandView[];
  pairings: PairingStatus[];
  recordings: ShowRecording[];
  recordingsError: string | null;
  job: ShowEditView | null;
  /** The show's YouTube publication status (DRAFT until scheduled), or null when nothing was uploaded. */
  publicationStatus: string | null;
  /** At REVIEW, while the edited file is the show's draft: playable links for the preview. */
  preview: { videoUrl: string; posterUrl: string | null } | null;
};

/** `Shows/` listing → recordings, newest first, at most 30. */
export function recordingsFromListing(items: DriveListItem[], now = new Date()): ShowRecording[] {
  return items
    .filter((item) => !item.isDir && RECORDING_EXTENSIONS.test(item.name) && !item.name.startsWith("."))
    .map((item) => {
      const modified = new Date(item.mtime);
      const valid = !Number.isNaN(modified.getTime());
      return {
        path: item.path,
        name: item.name,
        size: item.size,
        modifiedAt: valid ? modified.toISOString() : new Date(0).toISOString(),
        stable: valid && now.getTime() - modified.getTime() > RECORDING_STABLE_MS
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, MAX_LISTED_RECORDINGS);
}

export function editorOnline(lastSeenAt: Date | string | null | undefined, now = new Date()) {
  if (!lastSeenAt) return false;
  return now.getTime() - new Date(lastSeenAt).getTime() < EDITOR_ONLINE_MS;
}

/** Phase 2: an edit may publish itself only when nothing was flagged and every check passed. */
export function autoPublishReady(input: { needsReview: boolean; checks: unknown }) {
  if (input.needsReview || !input.checks || typeof input.checks !== "object") return false;
  const checks = input.checks as { coversClean?: unknown; loudness?: unknown };
  if (checks.coversClean !== true || !Array.isArray(checks.loudness) || checks.loudness.length === 0) return false;
  return checks.loudness.every((row) => Boolean(row) && typeof row === "object" && (row as { ok?: unknown }).ok === true);
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function lastSeenLabel(lastSeenAt: string | null, now = new Date()) {
  if (!lastSeenAt) return "never";
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(lastSeenAt).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** The panel's one-line editor status. */
export function editorStatus(worker: ShowEditWorker, now = new Date()): { tone: "success" | "warning" | "danger"; label: string } {
  const version = worker.version ? ` · ${worker.version}` : "";
  if (!worker.online) return { tone: "danger", label: `Editor offline · last seen ${lastSeenLabel(worker.lastSeenAt, now)}` };
  if (worker.health && !worker.health.ok) return { tone: "warning", label: `Editor needs attention${version}` };
  return { tone: "success", label: `Editor online${worker.busy ? " · busy" : ""}${version}` };
}

/**
 * Shows are filmed the school day before they air: preselect the newest finished recording from the
 * few days before the show (never one from the show day or later).
 */
export function defaultRecordingSelection(recordings: ShowRecording[], showDate: string, timeZone = "America/Los_Angeles") {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const showMs = Date.parse(`${showDate}T12:00:00Z`);
  const pick = recordings.find((recording) => {
    if (!recording.stable) return false;
    const filmed = day.format(new Date(recording.modifiedAt));
    const daysBefore = (showMs - Date.parse(`${filmed}T12:00:00Z`)) / 86_400_000;
    return daysBefore >= 1 && daysBefore <= 4;
  });
  return pick ? [pick.path] : [];
}

/** Ordered multi-select: clicking adds a recording to the end, clicking again removes it. */
export function toggleRecording(selected: string[], path: string) {
  if (selected.includes(path)) return selected.filter((item) => item !== path);
  return selected.length >= MAX_SHOW_EDIT_SOURCES ? selected : [...selected, path];
}
