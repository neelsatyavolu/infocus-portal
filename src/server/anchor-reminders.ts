import { castDisplayNames } from "@/src/lib/name-sort";
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
