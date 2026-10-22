import type { ShowEditJob } from "@prisma/client";
import { sendBrandedEmails } from "@/src/lib/email";
import { mainAppOrigin } from "@/src/lib/hosts";
import { pacificDateKey } from "@/src/lib/meetings/schedule";
import { PACKAGE_ADVISER_EMAIL } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { addDaysToDateKey, formatShowDateLabel, nextUpcomingShowDate } from "@/src/lib/show-assignment";
import type { ShowEditDecision, ShowRecording } from "@/src/lib/show-editor";
import { listShowRecordings } from "@/src/server/show-editor-drive";
import { autoStartGroups, type AutoStartGroup } from "@/src/lib/show-editor-sources";
import { editingHref } from "@/src/lib/show-editor-views";
import { findShowManagerEmail, resolveShowManagers } from "@/src/server/show-manager";
import { loadScheduleOverrides } from "@/src/server/show-schedule";
import { sendPushToUserIds } from "@/src/server/push-notify";

export type ShowEditNotice = "review" | "needs-review" | "failed" | "published";

type NoticeJob = Pick<ShowEditJob, "id" | "showDate" | "createdById" | "version" | "error" | "decisions" | "needsReview" | "status">;

const AUTO_START_EVERY_MS = 5 * 60_000;

function showLink(showDate: string) {
  return `${mainAppOrigin()}${editingHref({ date: showDate })}`;
}

async function showManagerEmail(showDate: string) {
  const { managers } = await resolveShowManagers([showDate]);
  const name = managers[showDate]?.name ?? "";
  return name ? findShowManagerEmail(name) : "";
}

/** The person who started the edit plus that date's show manager (emails and Portal user ids). */
async function recipientsFor(showDate: string, starterId: string) {
  const [starter, managerEmail] = await Promise.all([
    prisma.user.findUnique({
      where: { id: starterId },
      select: { email: true, notificationPreference: { select: { notificationEmail: true } } }
    }),
    showManagerEmail(showDate).catch(() => "")
  ]);
  const starterEmail = (starter?.notificationPreference?.notificationEmail ?? starter?.email ?? "").trim();
  const managers = managerEmail
    ? await prisma.user.findMany({ where: { email: { equals: managerEmail, mode: "insensitive" } }, select: { id: true } })
    : [];
  const emails = [...new Set([starterEmail, managerEmail].filter(Boolean).map((email) => email.trim()))];
  const userIds = [...new Set([starter ? starterId : "", ...managers.map((user) => user.id)].filter(Boolean))];
  return { emails, userIds };
}

function firstFlagged(job: NoticeJob) {
  const decisions = Array.isArray(job.decisions) ? (job.decisions as unknown as ShowEditDecision[]) : [];
  return decisions.find((decision) => decision.flagged)?.detail ?? null;
}

function noticeCopy(job: NoticeJob, notice: ShowEditNotice) {
  const label = formatShowDateLabel(job.showDate);
  switch (notice) {
    case "review":
      return {
        subject: `The ${label} show is edited and ready for review`,
        heading: "Ready for review",
        lines: [`The automatic edit of the ${label} show is done and every check passed. Watch it, then press Review & schedule.`]
      };
    case "needs-review":
      return {
        subject: `The ${label} show edit needs a look`,
        heading: "Edited, with something to check",
        lines: [
          `The automatic edit of the ${label} show is done, but the editor flagged something for a person to check.`,
          `First flag: ${firstFlagged(job) ?? "a check didn't pass"}`,
          "Watch it, ask for a fix if needed, then press Review & schedule."
        ]
      };
    case "failed":
      return {
        subject: `The automatic edit of the ${label} show failed`,
        heading: "The automatic edit failed",
        lines: [
          `Reason: ${job.error ?? "unknown"}`,
          "Open Editing to try again with Redo, or upload the show yourself from The Show."
        ]
      };
    case "published":
      return {
        subject: `The ${label} show was edited and scheduled`,
        heading: "Edited and scheduled",
        lines: [`The automatic edit of the ${label} show passed every check and is scheduled on YouTube. You can still change it in YouTube Studio.`]
      };
  }
}

/** Email (with the Mac/iPhone app push) and browser push to the starter and the show manager. Never throws. */
export async function notifyShowEdit(job: NoticeJob, notice: ShowEditNotice) {
  try {
    const { emails, userIds } = await recipientsFor(job.showDate, job.createdById);
    const copy = noticeCopy(job, notice);
    const url = showLink(job.showDate);
    await Promise.all([
      emails.length > 0
        ? sendBrandedEmails({
            recipients: emails,
            subject: copy.subject,
            heading: copy.heading,
            paragraphs: copy.lines,
            ctaLabel: "Open Editing",
            ctaUrl: url,
            idempotencyKey: `show-edit/${job.id}/${notice}/${job.version}`
          })
        : null,
      sendPushToUserIds(userIds, { title: copy.subject, body: copy.lines[0], url })
    ]);
  } catch (error) {
    console.error("show editor: notification failed", job.id, notice, error);
  }
}

async function autoStartUserId(showDate: string) {
  const email = (await showManagerEmail(showDate).catch(() => "")) || PACKAGE_ADVISER_EMAIL || "";
  if (!email) return null;
  const users = await prisma.user.findMany({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  return users[0]?.id ?? null;
}

/** What auto-start would edit per upcoming show (airing today through a week out) right now. */
export function showEditAutoStartGroups(recordings: ShowRecording[], now = new Date()): AutoStartGroup[] {
  const today = pacificDateKey(now);
  return autoStartGroups(recordings, { now, firstDate: today, lastDate: addDaysToDateKey(today, 7) });
}

/**
 * Auto-start on (setting, or SHOW_EDITOR_AUTO_START=1; called from the editors' heartbeats, at most every
 * 5 minutes): once every recording named after an upcoming show has settled on Drive, start that show's
 * edit with every file on Auto, unless the show already has an edit or was sent to YouTube.
 */
export async function runShowEditAutoStart(now: Date) {
  // Several machines heartbeat; the settings row makes sure only one of them looks at Drive per 5 minutes.
  await prisma.showEditorSettings.upsert({ where: { id: "editor" }, update: {}, create: { id: "editor" } });
  const due = await prisma.showEditorSettings.updateMany({
    where: { id: "editor", OR: [{ lastAutoStartCheckAt: null }, { lastAutoStartCheckAt: { lt: new Date(now.getTime() - AUTO_START_EVERY_MS) } }] },
    data: { lastAutoStartCheckAt: now }
  });
  if (due.count === 0) return;

  for (const group of showEditAutoStartGroups(await listShowRecordings(now), now)) {
    if (!group.ready) continue;
    const [existing, publication] = await Promise.all([
      prisma.showEditJob.findMany({ where: { showDate: group.showDate }, select: { id: true, status: true } }),
      prisma.showPublication.findUnique({ where: { showDate: group.showDate } })
    ]);
    if (existing.length > 0 || (publication && publication.status !== "DRAFT")) continue;
    const createdById = await autoStartUserId(group.showDate);
    if (!createdById) {
      console.error("show editor: auto-start has no show manager or adviser account", group.showDate);
      continue;
    }
    const sources = group.files.map((file) => ({ path: file.path, role: "auto" as const }));
    await prisma.showEditJob.create({
      data: { showDate: group.showDate, sourcePaths: sources, createdById, message: "Started automatically when the recordings reached Drive." }
    });
  }
}

/** Daily 18:00 Pacific: a show that airs tomorrow, had an automatic edit, and isn't scheduled yet gets one reminder. */
export async function runShowEditReminders(now = new Date()) {
  const today = pacificDateKey(now);
  const overrides = await loadScheduleOverrides(today, addDaysToDateKey(today, 7));
  const showDate = nextUpcomingShowDate(today, overrides, { includeToday: false });
  if (!showDate || showDate !== addDaysToDateKey(today, 1)) return { sent: 0, reason: "no show tomorrow" };
  const [job, publication] = await Promise.all([
    prisma.showEditJob.findFirst({ where: { showDate }, orderBy: { createdAt: "desc" } }),
    prisma.showPublication.findUnique({ where: { showDate } })
  ]);
  if (!job) return { sent: 0, date: showDate, reason: "no automatic edit" };
  if (publication && publication.status !== "DRAFT") return { sent: 0, date: showDate, reason: "scheduled" };

  const { emails, userIds } = await recipientsFor(showDate, job.createdById);
  if (emails.length === 0) return { sent: 0, date: showDate, reason: "no recipients" };
  const label = formatShowDateLabel(showDate);
  const where = job.status === "REVIEW" ? "The automatic edit is waiting for review." : `The automatic edit is ${job.status.toLowerCase()}.`;
  const subject = `The ${label} show isn't scheduled yet`;
  const result = await sendBrandedEmails({
    recipients: emails,
    subject,
    heading: "Tomorrow's show isn't scheduled",
    paragraphs: [`The ${label} show airs tomorrow and isn't scheduled on YouTube yet.`, where],
    ctaLabel: "Open Editing",
    ctaUrl: showLink(showDate),
    idempotencyKey: `show-edit-reminder/${showDate}`
  });
  await sendPushToUserIds(userIds, { title: subject, body: where, url: showLink(showDate) });
  return { sent: result.sent > 0 ? 1 : 0, date: showDate };
}
