import type { Prisma, ShowEditJob } from "@prisma/client";
import { pacificDateKey } from "@/src/lib/meetings/schedule";
import { prisma } from "@/src/lib/prisma";
import { addDaysToDateKey } from "@/src/lib/show-assignment";
import {
  AUTO_SCHEDULE_LEAD_MS, escalationStep, withEscalation, type ShowEditEscalation
} from "@/src/lib/show-editor-escalation";
import { isReviewedDraft, scheduleWithDefaults, ShowEditError } from "@/src/server/show-editor";
import { notifyShowEditEscalation } from "@/src/server/show-editor-notify";

/**
 * Saves what was done in this version's `checks.escalation`, only while the job is still this version at
 * Review (so a producer's action in the meantime wins); `data` can end the job too.
 */
async function saveEscalation(job: ShowEditJob, patch: Partial<ShowEditEscalation>, data: Prisma.ShowEditJobUpdateManyMutationInput = {}) {
  const saved = await prisma.showEditJob.updateMany({
    where: { id: job.id, status: "REVIEW", version: job.version },
    data: { ...data, checks: withEscalation(job.checks, { ...patch, version: job.version }) as Prisma.InputJsonValue }
  });
  return saved.count > 0;
}

async function escalate(job: ShowEditJob, now: Date) {
  // Recorded before sending, so a slow send is never repeated by the next tick.
  if (!(await saveEscalation(job, { producersAt: now.toISOString() }))) return false;
  await notifyShowEditEscalation(job, { kind: "escalate", at: now.toISOString() });
  return true;
}

/** The 8 AM deadline passed: schedule with Upload show's defaults, never sooner than 15 minutes from now. */
async function autoSchedule(job: ShowEditJob, now: Date) {
  try {
    const publishAt = await scheduleWithDefaults(job.showDate, job.createdById, now, new Date(now.getTime() + AUTO_SCHEDULE_LEAD_MS));
    await saveEscalation(job, { autoScheduledAt: now.toISOString() }, { status: "PUBLISHED" });
    await notifyShowEditEscalation(job, { kind: "auto-scheduled", publishAt });
    return true;
  } catch (error) {
    console.error("show editor: auto-schedule failed", job.id, error);
    const reason = error instanceof ShowEditError ? error.message : "Something went wrong. Try again.";
    // Tried once per version; producers can still approve or use Change details.
    if (await saveEscalation(job, { autoScheduleError: reason })) await notifyShowEditEscalation(job, { kind: "auto-schedule-failed", reason });
    return false;
  }
}

/**
 * Every minute (worker.ts → /api/service/show-editor/tick): edits at Review for today's or tomorrow's show,
 * still the show's draft, are escalated to producers or scheduled, per `escalationStep`.
 */
export async function runShowEditEscalations(now = new Date()) {
  const today = pacificDateKey(now);
  const jobs = await prisma.showEditJob.findMany({
    where: { status: "REVIEW", showDate: { gte: today, lte: addDaysToDateKey(today, 1) } }
  });
  const result = { checked: jobs.length, escalated: 0, scheduled: 0, failed: 0 };
  for (const job of jobs) {
    const step = escalationStep(job, now);
    if (step === "none") continue;
    const publication = await prisma.showPublication.findUnique({ where: { showDate: job.showDate } });
    // Scheduled from the dialog, or another file uploaded: nothing to escalate.
    if (!isReviewedDraft(job, publication)) continue;
    if (step === "escalate") {
      if (await escalate(job, now)) result.escalated += 1;
    } else if (await autoSchedule(job, now)) {
      result.scheduled += 1;
    } else {
      result.failed += 1;
    }
  }
  return result;
}
