import { extractCalendarPaAnnouncers } from "@/src/lib/calendar-show-content";
import { castDisplayNames } from "@/src/lib/name-sort";
import { paDateLabel, paTimeLabel, resolvePaPeople } from "@/src/lib/pa-script";
import { resolveScheduleDay } from "@/src/lib/school-schedule";
import { sendBrandedEmails } from "@/src/lib/email";
import { mainAppOrigin } from "@/src/lib/hosts";
import { pacificDateKey } from "@/src/lib/meetings/schedule";
import { normalizeEmail, PACKAGE_ADVISER_EMAIL } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { FIRST_SHOW_DATE, addDaysToDateKey, formatShowDateLabel, listShowDatesThrough } from "@/src/lib/show-assignment";
import { showFilmingEndsAt } from "@/src/lib/show-roles-confirm";
import { loadPalyClassSessions } from "@/src/server/paly-bell-schedule";
import { loadShowAnchorNames } from "@/src/server/show-roles-confirm";
import { loadScheduleOverrides } from "@/src/server/show-schedule";

/** "night-before": 9 PM the evening before filming. "morning-of": 8 AM on the filming day. */
export type AnchorReminderKind = "night-before" | "morning-of";

const PACIFIC = "America/Los_Angeles";

/**
 * Anchor display name → account email. Names on The Show are cast display names (first name, or
 * full name when two people share one), built from the cast dropdown (no advisers) or, for names
 * the generator picked, from every registered user. Try the dropdown's naming first.
 */
async function loadAnchorEmailDirectory() {
  const [users, advisers] = await Promise.all([
    prisma.user.findMany({
      select: { name: true, nickname: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    }),
    prisma.platformRoleAssignment.findMany({ where: { role: "ADVISER" }, select: { email: true } })
  ]);
  const named = users.filter((user) => Boolean(user.nickname?.trim() || user.name?.trim()));
  const blocked = new Set([...advisers.map((row) => row.email), PACKAGE_ADVISER_EMAIL].map(normalizeEmail).filter(Boolean));
  const dropdown = named.filter((user) => !blocked.has(normalizeEmail(user.email)));

  const directory = new Map<string, string>();
  for (const pool of [dropdown, named]) {
    const names = castDisplayNames(pool);
    pool.forEach((user, index) => {
      const name = names[index];
      const email = normalizeEmail(user.email);
      if (name && email && !directory.has(name)) directory.set(name, email);
    });
  }
  return directory;
}

function formatPacificTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: PACIFIC, hour: "numeric", minute: "2-digit" });
}

function reminderCopy(kind: AnchorReminderKind, name: string, showDate: string, filmingStartsAt: string | null) {
  const label = formatShowDateLabel(showDate);
  const when = kind === "night-before" ? "tomorrow" : "today";
  const start = filmingStartsAt ? `, starting at ${formatPacificTime(filmingStartsAt)}` : "";
  return {
    subject: kind === "night-before" ? `You're anchoring tomorrow` : `You're anchoring today`,
    heading: kind === "night-before" ? "Anchoring tomorrow" : "Anchoring today",
    paragraphs: [
      `Hi ${name},`,
      `You're anchoring the ${label} show. It's filmed ${when} in 1st period${start}.`
    ]
  };
}

/**
 * Email (with the Mac/iPhone app push) every anchor of each show filmed on the target day:
 * tomorrow for the 9 PM run, today for the 8 AM run. Shows are filmed in 1st period on the
 * school day before they air.
 */
export async function runAnchorReminders(kind: AnchorReminderKind, now = new Date()) {
  const today = pacificDateKey(now);
  const filmingDay = kind === "night-before" ? addDaysToDateKey(today, 1) : today;
  const horizon = addDaysToDateKey(today, 7);
  const [overrides, sessions] = await Promise.all([
    loadScheduleOverrides(FIRST_SHOW_DATE, horizon),
    loadPalyClassSessions(addDaysToDateKey(today, -7), horizon)
  ]);
  const shows = listShowDatesThrough(horizon, overrides).filter(
    (showDate) => showDate > filmingDay && pacificDateKey(showFilmingEndsAt(showDate, sessions)) === filmingDay
  );
  if (shows.length === 0) return { sent: 0, kind, filmingDay, reason: "no filming" };

  const directory = await loadAnchorEmailDirectory();
  const filmingStartsAt = sessions.find((session) => session.date === filmingDay)?.startsAt ?? null;
  const missing: string[] = [];
  let sent = 0;

  for (const showDate of shows) {
    const anchors = await loadShowAnchorNames(showDate);
    for (const name of anchors) {
      const email = directory.get(name);
      if (!email) {
        missing.push(name);
        continue;
      }
      const copy = reminderCopy(kind, name, showDate, filmingStartsAt);
      const result = await sendBrandedEmails({
        recipients: [email],
        ...copy,
        ctaLabel: "Open The Show",
        ctaUrl: `${mainAppOrigin()}/show-roles?date=${showDate}`,
        idempotencyKey: `anchor-reminder/${showDate}/${kind}/${email}`
      });
      if (result.sent > 0) sent += 1;
      else console.error("anchor reminder: email not sent", showDate, kind, result);
    }
  }
  if (missing.length > 0) console.error("anchor reminder: no email for anchor", filmingDay, missing);
  return { sent, kind, filmingDay, shows, missing };
}

function paReminderCopy(kind: AnchorReminderKind, name: string, paDate: string) {
  const when = kind === "night-before" ? "tomorrow" : "today";
  return {
    subject: kind === "night-before" ? "You're reading the PA tomorrow" : "You're reading the PA today",
    heading: kind === "night-before" ? "PA announcements tomorrow" : "PA announcements today",
    paragraphs: [
      `Hi ${name},`,
      `You're reading the PA announcements ${when} (${paDateLabel(paDate)}), at the ${paTimeLabel(paDate).toLowerCase()}. The script is on the PA page.`
    ]
  };
}

/** PA announcer name → email: the anchor directory first, then the PA page's own name match. */
async function resolvePaEmails(names: string[], directory: Map<string, string>) {
  const unresolved = names.filter((name) => !directory.has(name));
  const users =
    unresolved.length > 0 ? await prisma.user.findMany({ select: { id: true, name: true, nickname: true, email: true } }) : [];
  const matched = resolvePaPeople(unresolved, users);
  const emailById = new Map(users.map((user) => [user.id, normalizeEmail(user.email)]));
  return names.map((name) => {
    const direct = directory.get(name);
    if (direct) return direct;
    const person = matched[unresolved.indexOf(name)];
    return (person && emailById.get(person.id)) || null;
  });
}

/**
 * Same timing as the anchors (9 PM the night before, 8 AM the day of): email (with the app push)
 * each PA announcer named on the master calendar for the PA day, read at the start of 2nd period.
 */
export async function runPaAnnouncerReminders(kind: AnchorReminderKind, now = new Date()) {
  const today = pacificDateKey(now);
  const paDate = kind === "night-before" ? addDaysToDateKey(today, 1) : today;
  const overrides = await loadScheduleOverrides(paDate, paDate);
  if (resolveScheduleDay(paDate, overrides).kind !== "PA") return { sent: 0, kind, paDate, reason: "no PA" };

  const entry = await prisma.masterCalendarEntry.findUnique({ where: { date: paDate }, select: { content: true } });
  const names = extractCalendarPaAnnouncers(entry?.content ?? "").slice(0, 2);
  if (names.length === 0) return { sent: 0, kind, paDate, reason: "no announcers" };

  const emails = await resolvePaEmails(names, await loadAnchorEmailDirectory());
  const missing: string[] = [];
  let sent = 0;
  for (const [index, name] of names.entries()) {
    const email = emails[index];
    if (!email) {
      missing.push(name);
      continue;
    }
    const result = await sendBrandedEmails({
      recipients: [email],
      ...paReminderCopy(kind, name, paDate),
      ctaLabel: "Open the PA script",
      ctaUrl: `${mainAppOrigin()}/announcements/pa`,
      idempotencyKey: `pa-reminder/${paDate}/${kind}/${email}`
    });
    if (result.sent > 0) sent += 1;
    else console.error("PA reminder: email not sent", paDate, kind, result);
  }
  if (missing.length > 0) console.error("PA reminder: no email for announcer", paDate, missing);
  return { sent, kind, paDate, missing };
}
