import type { ShowEditJob } from "@prisma/client";
import { sendBrandedEmails } from "@/src/lib/email";
import { mainAppOrigin } from "@/src/lib/hosts";
import { pacificDateKey } from "@/src/lib/meetings/schedule";
import { normalizeEmail, PACKAGE_ADVISER_EMAIL, PLATFORM_SUPER_ADMIN_EMAIL } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { addDaysToDateKey, formatShowDateLabel, nextUpcomingShowDate } from "@/src/lib/show-assignment";
import type { ShowEditDecision, ShowRecording } from "@/src/lib/show-editor";
import { listShowRecordings } from "@/src/server/show-editor-drive";
import { autoStartGroups, roleFromName, type AutoStartGroup } from "@/src/lib/show-editor-sources";
import { editingHref } from "@/src/lib/show-editor-views";
import { isAutoStarted } from "@/src/lib/show-editor-escalation";
import { findShowManagerEmail, resolveShowManagers } from "@/src/server/show-manager";
import { loadScheduleOverrides } from "@/src/server/show-schedule";
import { sendPushToUserIds } from "@/src/server/push-notify";

export type ShowEditNotice = "review" | "needs-review" | "failed" | "published";

type NoticeJob = Pick<ShowEditJob, "id" | "showDate" | "createdById" | "version" | "error" | "decisions" | "needsReview" | "status" | "checks">;
type Recipients = { emails: string[]; userIds: string[] };

const AUTO_START_EVERY_MS = 5 * 60_000;

function showLink(showDate: string) {
  return `${mainAppOrigin()}${editingHref({ date: showDate })}`;
}

async function showManagerEmail(showDate: string) {
  const { managers } = await resolveShowManagers([showDate]);
  const name = managers[showDate]?.name ?? "";
  return name ? findShowManagerEmail(name) : "";
}

/**
 * The person who started the edit plus that date's show manager (the Master Calendar's, or the rotation's),
 * as emails and Portal user ids. An auto-started edit has no starter: only the show manager.
 */
async function recipientsFor(showDate: string, starterId: string | null): Promise<Recipients> {
  const [starter, managerEmail] = await Promise.all([
    starterId
      ? prisma.user.findUnique({
          where: { id: starterId },
          select: { email: true, notificationPreference: { select: { notificationEmail: true } } }
        })
      : Promise.resolve(null),
    showManagerEmail(showDate).catch(() => "")
  ]);
  const starterEmail = (starter?.notificationPreference?.notificationEmail ?? starter?.email ?? "").trim();
  const managers = managerEmail
    ? await prisma.user.findMany({ where: { email: { equals: managerEmail, mode: "insensitive" } }, select: { id: true } })
    : [];
  const emails = [...new Set([starterEmail, managerEmail].filter(Boolean).map((email) => email.trim()))];
  const userIds = [...new Set([starter && starterId ? starterId : "", ...managers.map((user) => user.id)].filter(Boolean))];
  return { emails, userIds };
}

function starterOf(job: NoticeJob) {
  return isAutoStarted(job.checks) ? null : job.createdById;
}

/** Everyone who can approve: every platform role (all are associate producer or up) and the staff set in env. */
async function producerRecipients(): Promise<Recipients> {
  const assignments = await prisma.platformRoleAssignment.findMany({ select: { email: true } });
  const roleEmails = [...new Set([...assignments.map((entry) => entry.email), PLATFORM_SUPER_ADMIN_EMAIL, PACKAGE_ADVISER_EMAIL]
    .map((email) => normalizeEmail(email)).filter(Boolean))];
  const users = roleEmails.length > 0
    ? await prisma.user.findMany({
        where: { OR: roleEmails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })) },
        select: { id: true, email: true, notificationPreference: { select: { notificationEmail: true } } }
      })
    : [];
  // A producer's notification address wins over the sign-in one, as for the starter.
  const preferred = new Map(users.map((user) => [normalizeEmail(user.email), user.notificationPreference?.notificationEmail?.trim() || user.email]));
  return { emails: [...new Set(roleEmails.map((email) => preferred.get(email) ?? email))], userIds: users.map((user) => user.id) };
}

function mergeRecipients(...lists: Recipients[]): Recipients {
  return {
    emails: [...new Set(lists.flatMap((list) => list.emails))],
    userIds: [...new Set(lists.flatMap((list) => list.userIds))]
  };
}

type Copy = { subject: string; heading: string; lines: string[] };

/** Email (with the Mac/iPhone app push) and browser push, linking to the show on Editing. */
async function deliver(recipients: Recipients, copy: Copy, showDate: string, idempotencyKey: string) {
  const url = showLink(showDate);
  await Promise.all([
    recipients.emails.length > 0
      ? sendBrandedEmails({
          recipients: recipients.emails,
          subject: copy.subject,
          heading: copy.heading,
          paragraphs: copy.lines,
          ctaLabel: "Open Editing",
          ctaUrl: url,
          idempotencyKey
        })
      : null,
    sendPushToUserIds(recipients.userIds, { title: copy.subject, body: copy.lines[0], url })
  ]);
}

/** The flag the email quotes: a missing or unused package first (someone has to act on it), else the first one. */
function firstFlagged(job: NoticeJob) {
  const decisions = Array.isArray(job.decisions) ? (job.decisions as unknown as ShowEditDecision[]) : [];
  const flagged = decisions.filter((decision) => decision.flagged);
  return (flagged.find((decision) => decision.kind === "package") ?? flagged[0])?.detail ?? null;
}

function noticeCopy(job: NoticeJob, notice: ShowEditNotice) {
  const label = formatShowDateLabel(job.showDate);
  switch (notice) {
    case "review":
      return {
        subject: `The ${label} show is edited and ready for review`,
        heading: "Ready for review",
        lines: [`The automatic edit of the ${label} show is done and every check passed. Watch it, then press Approve & schedule.`]
      };
    case "needs-review":
      return {
        subject: `The ${label} show edit needs a look`,
        heading: "Edited, with something to check",
        lines: [
          `The automatic edit of the ${label} show is done, but the editor flagged something for a person to check.`,
          `First flag: ${firstFlagged(job) ?? "a check didn't pass"}`,
          "Watch it, then press Approve & schedule, or Send back if it needs changes."
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
    const recipients = await recipientsFor(job.showDate, starterOf(job));
    await deliver(recipients, noticeCopy(job, notice), job.showDate, `show-edit/${job.id}/${notice}/${job.version}`);
  } catch (error) {
    console.error("show editor: notification failed", job.id, notice, error);
  }
}

export type ShowEditEscalationNotice =
  | { kind: "escalate"; at: string }
  | { kind: "auto-scheduled"; publishAt: Date }
  | { kind: "auto-schedule-failed"; reason: string };

const shortDate = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const pacificClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });

/** "Fri, Oct 23" for a show date key. */
export function shortShowDate(showDate: string) {
  const [year, month, day] = showDate.split("-").map(Number);
  return shortDate.format(new Date(Date.UTC(year, month - 1, day)));
}

function escalationCopy(job: NoticeJob, notice: ShowEditEscalationNotice): Copy {
  const date = shortShowDate(job.showDate);
  switch (notice.kind) {
    case "escalate":
      return {
        subject: `The ${date} show still needs approval`,
        heading: "Still waiting for approval",
        lines: [
          `The automatic edit of the ${date} show has been ready for over an hour, and the show manager hasn't responded.`,
          "If nobody approves it, it's scheduled automatically at 8:00 AM on show day. Watch it, then press Approve & schedule, or Send back if it needs changes."
        ]
      };
    case "auto-scheduled":
      return {
        subject: `The ${date} show was scheduled automatically`,
        heading: "Scheduled automatically",
        lines: [
          `The ${date} show was scheduled automatically because nobody approved it by 8:00 AM. It publishes at ${pacificClock.format(notice.publishAt)}.`,
          "You can still change it in YouTube Studio."
        ]
      };
    case "auto-schedule-failed":
      return {
        subject: `The ${date} show couldn't be scheduled automatically`,
        heading: "Couldn't schedule it",
        lines: [
          `Nobody approved the ${date} show by 8:00 AM, and scheduling it automatically failed: ${notice.reason}`,
          "Open Editing and schedule it with Change details."
        ]
      };
  }
}

/**
 * The approval cron's notices: the hourly escalation goes to every producer; the auto-schedule notice to the
 * starter and show manager; a failed auto-schedule to all of them. Never throws.
 */
export async function notifyShowEditEscalation(job: NoticeJob, notice: ShowEditEscalationNotice) {
  try {
    const recipients = notice.kind === "escalate"
      ? await producerRecipients()
      : notice.kind === "auto-scheduled"
        ? await recipientsFor(job.showDate, starterOf(job))
        : mergeRecipients(await recipientsFor(job.showDate, starterOf(job)), await producerRecipients());
    // Each hourly reminder is its own email.
    const key = `show-edit/${job.id}/${notice.kind}/${job.version}${notice.kind === "escalate" ? `/${notice.at}` : ""}`;
    await deliver(recipients, escalationCopy(job, notice), job.showDate, key);
  } catch (error) {
    console.error("show editor: escalation notice failed", job.id, notice.kind, error);
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
    const sources = group.files.map((file) => ({ path: file.path, role: roleFromName(file.name) }));
    // createdById is the show manager's (or adviser's) account; autoStarted keeps the notices to the show manager.
    await prisma.showEditJob.create({
      data: {
        showDate: group.showDate, sourcePaths: sources, createdById, message: "Started automatically when the recordings reached Drive.",
        checks: { autoStarted: true }
      }
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

  const { emails, userIds } = await recipientsFor(showDate, starterOf(job));
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
