import { extractCalendarAnchors } from "@/src/lib/calendar-show-content";
import { sendBrandedEmails } from "@/src/lib/email";
import { mainAppOrigin } from "@/src/lib/hosts";
import { pacificDateKey } from "@/src/lib/meetings/schedule";
import { prisma } from "@/src/lib/prisma";
import { FIRST_SHOW_DATE, addDaysToDateKey, formatShowDateLabel, listShowDatesThrough } from "@/src/lib/show-assignment";
import {
  SHOW_ROLES_REMINDER_INTERVAL_MS,
  latestFilmedShowDate,
  showFilmingEndsAt,
  showRolesReminderDue
} from "@/src/lib/show-roles-confirm";
import { loadPalyClassSessions } from "@/src/server/paly-bell-schedule";
import { loadScheduleOverrides } from "@/src/server/show-schedule";
import { findShowManagerEmail, resolveShowManagers } from "@/src/server/show-manager";
import { ROLES } from "@/src/show-roles/lib/constants";

async function loadShowRoleLines(dateKey: string) {
  const [entry, show] = await Promise.all([
    prisma.masterCalendarEntry.findUnique({ where: { date: dateKey }, select: { content: true } }),
    prisma.showRolesShow.findUnique({ where: { date: dateKey }, select: { assignments: true, anchors: true } })
  ]);
  const assignments =
    show?.assignments && typeof show.assignments === "object" && !Array.isArray(show.assignments)
      ? (show.assignments as Record<string, string>)
      : {};
  // Same precedence as The Show: calendar anchors, then the generator's.
  const calendarAnchors = entry ? extractCalendarAnchors(entry.content) : [];
  const storedAnchors = Array.isArray(show?.anchors)
    ? show.anchors.filter((name): name is string => typeof name === "string" && name.length > 0)
    : [];
  const anchors = calendarAnchors.length > 0 ? calendarAnchors : storedAnchors;
  return [
    `Anchors: ${anchors.join(", ") || "not set"}`,
    ...ROLES.map((role) => `${role}: ${assignments[role] || "not set"}`)
  ];
}

/**
 * Hourly: once 1st period on the day before a show ends (it's filmed then), email its show manager
 * to confirm the roles on The Show, then again every 3 hours (none 9 PM to 7 AM) until someone
 * confirms. Only the latest filmed show is checked; the next one takes over once it's filmed.
 */
export async function runShowRolesConfirmReminders(now = new Date()) {
  const today = pacificDateKey(now);
  const horizon = addDaysToDateKey(today, 7);
  const [overrides, sessions] = await Promise.all([
    loadScheduleOverrides(FIRST_SHOW_DATE, horizon),
    loadPalyClassSessions(addDaysToDateKey(today, -14), horizon)
  ]);
  const dateKey = latestFilmedShowDate(listShowDatesThrough(horizon, overrides), sessions, now);
  if (!dateKey) return { sent: 0, reason: "no show yet" };

  const existing = await prisma.showRolesConfirmation.findUnique({ where: { date: dateKey } });
  const due = showRolesReminderDue({
    now,
    filmedEndsAt: showFilmingEndsAt(dateKey, sessions),
    confirmedAt: existing?.confirmedAt ?? null,
    lastReminderAt: existing?.lastReminderAt ?? null
  });
  if (!due) return { sent: 0, date: dateKey };

  const { managers } = await resolveShowManagers([dateKey]);
  const managerName = managers[dateKey]?.name ?? "";
  const email = managerName ? await findShowManagerEmail(managerName) : "";
  if (!email) {
    console.error("show roles reminder: no email for show manager", dateKey, managerName || "(none)");
    return { sent: 0, date: dateKey, reason: "no show manager email" };
  }

  // Claim this reminder so overlapping runs send it once.
  await prisma.showRolesConfirmation.upsert({ where: { date: dateKey }, create: { date: dateKey }, update: {} });
  const claimed = await prisma.showRolesConfirmation.updateMany({
    where: {
      date: dateKey,
      confirmedAt: null,
      lastReminderAt: existing?.lastReminderAt ?? null
    },
    data: { lastReminderAt: now, reminderCount: { increment: 1 } }
  });
  if (claimed.count === 0) return { sent: 0, date: dateKey };

  const label = formatShowDateLabel(dateKey);
  const result = await sendBrandedEmails({
    recipients: [email],
    subject: `Confirm the show roles for ${label}`,
    heading: "Are the show roles right?",
    paragraphs: [
      `Hi ${managerName},`,
      `You were show manager for the ${label} show. Check that The Show lists who actually did each job, fix anything that's wrong, then press Roles are correct.`,
      ...(await loadShowRoleLines(dateKey)),
      `You'll get this email every ${SHOW_ROLES_REMINDER_INTERVAL_MS / 3_600_000} hours until the roles are confirmed.`
    ],
    ctaLabel: "Check the roles",
    ctaUrl: `${mainAppOrigin()}/show-roles?date=${dateKey}`,
    idempotencyKey: `show-roles-confirm/${dateKey}/${now.toISOString().slice(0, 13)}`
  });

  if (result.sent === 0) {
    // Undo the claim so the next hourly run tries again.
    await prisma.showRolesConfirmation.updateMany({
      where: { date: dateKey, lastReminderAt: now },
      data: { lastReminderAt: existing?.lastReminderAt ?? null, reminderCount: { decrement: 1 } }
    });
    console.error("show roles reminder: email not sent", dateKey, result);
    return { sent: 0, date: dateKey, reason: "email failed" };
  }
  return { sent: 1, date: dateKey };
}

export async function confirmShowRoles(dateKey: string, confirmedBy: string, now = new Date()) {
  const row = await prisma.showRolesConfirmation.upsert({
    where: { date: dateKey },
    create: { date: dateKey, confirmedAt: now, confirmedBy },
    update: { confirmedAt: now, confirmedBy }
  });
  return { confirmedAt: row.confirmedAt?.toISOString() ?? null, confirmedBy: row.confirmedBy };
}

export async function loadShowRolesConfirmation(dateKey: string) {
  const row = await prisma.showRolesConfirmation.findUnique({
    where: { date: dateKey },
    select: { confirmedAt: true, confirmedBy: true }
  });
  return { confirmedAt: row?.confirmedAt?.toISOString() ?? null, confirmedBy: row?.confirmedBy ?? null };
}
