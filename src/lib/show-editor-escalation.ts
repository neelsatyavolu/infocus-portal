import { pacificDateKey, pacificLocalStamp } from "@/src/lib/meetings/schedule";
import { showPublishAt } from "@/src/lib/show-publication";

/**
 * Approval at Review: an edit nobody has approved after an hour is escalated to every producer once the
 * deadline (8:00 AM Pacific on show day) is under 12 hours away, and at the deadline it is scheduled with
 * Upload show's defaults. What was sent lives in the job's `checks.escalation`, per version, so a new
 * version (after Send back) starts the clock again. Pure; the cron runs it (src/server/show-editor-escalation.ts).
 */

export const REVIEW_DEADLINE_TIME = "08:00";
export const ESCALATE_AFTER_MS = 60 * 60_000;
export const ESCALATE_WITHIN_MS = 12 * 60 * 60_000;
/** The auto-schedule never publishes sooner than this from now. */
export const AUTO_SCHEDULE_LEAD_MS = 15 * 60_000;

export type ShowEditEscalation = {
  version: number;
  producersAt: string | null;
  autoScheduledAt: string | null;
  autoScheduleError: string | null;
};

export type EscalationStep = "none" | "escalate" | "auto-schedule";

function recordOf(checks: unknown): Record<string, unknown> {
  return checks && typeof checks === "object" && !Array.isArray(checks) ? (checks as Record<string, unknown>) : {};
}

function stampOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function reviewDeadline(showDate: string) {
  return showPublishAt(showDate, REVIEW_DEADLINE_TIME);
}

/** This version's record; one for an earlier version doesn't count. */
export function escalationOf(checks: unknown, version: number): ShowEditEscalation | null {
  const saved = recordOf(recordOf(checks).escalation);
  if (saved.version !== version) return null;
  return {
    version,
    producersAt: stampOrNull(saved.producersAt),
    autoScheduledAt: stampOrNull(saved.autoScheduledAt),
    autoScheduleError: stampOrNull(saved.autoScheduleError)
  };
}

/** `checks` with this version's record updated; every other key is kept. */
export function withEscalation(checks: unknown, patch: Partial<ShowEditEscalation> & { version: number }): Record<string, unknown> {
  const current = escalationOf(checks, patch.version)
    ?? { version: patch.version, producersAt: null, autoScheduledAt: null, autoScheduleError: null };
  return { ...recordOf(checks), escalation: { ...current, ...patch } };
}

/**
 * What the cron should do for a job now. `finishedAt` is when it (last) reached Review; anything a producer
 * does (approve, send back, redo, schedule) takes it out of Review or makes a new version.
 */
export function escalationStep(
  job: { status: string; showDate: string; version: number; finishedAt: Date | null; checks: unknown }, now: Date
): EscalationStep {
  if (job.status !== "REVIEW" || !job.finishedAt) return "none";
  const sent = escalationOf(job.checks, job.version);
  const untilDeadline = reviewDeadline(job.showDate).getTime() - now.getTime();
  if (untilDeadline <= 0) return sent?.autoScheduledAt || sent?.autoScheduleError ? "none" : "auto-schedule";
  if (sent?.producersAt) return "none";
  const waited = now.getTime() - job.finishedAt.getTime();
  return waited >= ESCALATE_AFTER_MS && untilDeadline < ESCALATE_WITHIN_MS ? "escalate" : "none";
}

/** A publish date and `HH:MM` (Pacific) no sooner than `earliest`, rounded up to the minute. */
export function publishSlotNotBefore(earliest: Date) {
  const at = new Date(Math.ceil(earliest.getTime() / 60_000) * 60_000);
  const stamp = pacificLocalStamp(at);
  return { publishDate: pacificDateKey(at), publishTime: `${stamp.slice(9, 11)}:${stamp.slice(11, 13)}` };
}

/** Auto-start's jobs (`checks.autoStarted`): nobody started them, so only the show manager hears about them. */
export function isAutoStarted(checks: unknown) {
  return recordOf(checks).autoStarted === true;
}

/** What the Portal itself keeps in `checks` when an editor's complete replaces the rest. */
export function portalChecks(checks: unknown): Record<string, unknown> {
  return isAutoStarted(checks) ? { autoStarted: true } : {};
}
