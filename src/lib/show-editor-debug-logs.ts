/**
 * Debug bundles the editing Mac uploads after every run (job log, agent transcripts, reports; no media).
 * The Portal keeps their paths in the job's `checks` JSON: `debugLog` is the latest, `debugLogs` all of them.
 * Contract: infocus-editor docs/portal-api.md, "Debug logs".
 */

/** One run's bundle as stored on the job. */
export type ShowEditDebugLogEntry = { version: number; path: string; at: string };

/** One run's bundle as the producer's view shows it; `url` is null past the newest few or when minting failed. */
export type ShowEditDebugLog = { version: number; url: string | null; at: string };

/** Only the newest bundles get a download link in the producer's view. */
export const DEBUG_LOG_LINKS = 5;

const LOG_SUFFIX = ".tar.gz";

function editorLogPrefix(showDate: string, jobId: string) {
  return `Package Storage/Shows/${showDate}/editor-logs/${jobId}-v`;
}

/** `Package Storage/Shows/<showDate>/editor-logs/<jobId>-v<version>-<stamp>.tar.gz` */
export function editorLogPath(input: { showDate: string; jobId: string; version: number; stamp: string }) {
  return `${editorLogPrefix(input.showDate, input.jobId)}${input.version}-${input.stamp}${LOG_SUFFIX}`;
}

/** A bundle path the editor may report for this job: its own date and job, one file in `editor-logs/`, no `..`. */
export function isEditorLogPath(path: string, showDate: string, jobId: string) {
  const prefix = editorLogPrefix(showDate, jobId);
  if (!path.startsWith(prefix) || !path.endsWith(LOG_SUFFIX) || path.includes("..")) return false;
  const name = path.slice(prefix.length, -LOG_SUFFIX.length);
  return name.length > 0 && !/[/\\]/.test(name);
}

function isEntry(value: unknown): value is ShowEditDebugLogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.version === "number" && typeof entry.path === "string" && typeof entry.at === "string";
}

/** The bundles stored on a job's `checks`, oldest first. */
export function debugLogsOf(checks: unknown): ShowEditDebugLogEntry[] {
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) return [];
  const logs = (checks as Record<string, unknown>).debugLogs;
  return Array.isArray(logs) ? logs.filter(isEntry) : [];
}

/**
 * `next` (the run's own checks) with the job's bundle list carried over from `previous` and `entry` appended,
 * so earlier versions' logs stay downloadable. With no bundles at all, `next` comes back unchanged.
 */
export function mergeDebugLog(
  previous: unknown, next: Record<string, unknown>, entry: ShowEditDebugLogEntry | null
): Record<string, unknown> {
  const kept = debugLogsOf(previous).filter((log) => log.path !== entry?.path);
  const logs = entry ? [...kept, entry] : kept;
  if (logs.length === 0) return next;
  return { ...next, debugLog: logs[logs.length - 1].path, debugLogs: logs };
}
