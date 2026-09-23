import { prisma } from "@/src/lib/prisma";
import { getPlatformRoleForEmail, hasPlatformRole } from "@/src/lib/platform-admin";
import { extractCalendarPaAnnouncers } from "@/src/lib/calendar-show-content";
import { buildPaScript, nextPaDate, PA_CALENDAR_END, PA_CALENDAR_START, paDateLabel, paToday, refreshPaNames, resolvePaPeople } from "@/src/lib/pa-script";
import { resolveScheduleDay, type ScheduleKind } from "@/src/lib/school-schedule";
import { loadA2Bulletin, type BulletinAutofill } from "@/src/server/teleprompter-bulletin";

type Actor = { userId: string; email?: string | null };

async function scheduleOverrides(now: Date) {
  const today = paToday(now);
  const rows = await prisma.schoolCalendarDay.findMany({
    where: { date: { gte: today < PA_CALENDAR_START ? PA_CALENDAR_START : today, lte: PA_CALENDAR_END } },
    select: { date: true, kind: true, label: true }
  });
  return new Map(rows.map((row) => [row.date, { kind: row.kind as ScheduleKind, label: row.label }]));
}

async function paAccess(actor: Actor, date: string) {
  const [entry, users, role] = await Promise.all([
    prisma.masterCalendarEntry.findUnique({ where: { date }, select: { content: true } }),
    prisma.user.findMany({ select: { id: true, name: true, nickname: true } }),
    getPlatformRoleForEmail(actor.email)
  ]);
  const rawNames = extractCalendarPaAnnouncers(entry?.content ?? "");
  const people = resolvePaPeople(rawNames, users);
  return {
    announcers: rawNames.map((raw, index) => people[index]?.name?.trim() || raw),
    canEdit: hasPlatformRole(role, "ASSOCIATE_PRODUCER") || people.some((person) => person?.id === actor.userId)
  };
}

function pageData(date: string, access: { announcers: string[]; canEdit: boolean }, script: { content: string; version: number }) {
  return { date, dateLabel: paDateLabel(date), ...access, script: { content: script.content, version: script.version } };
}

export async function loadPaPage(actor: Actor, now = new Date()) {
  const date = nextPaDate(now, await scheduleOverrides(now));
  if (!date) return { date: null, dateLabel: "", announcers: [], canEdit: false, script: null };
  const access = await paAccess(actor, date);
  const [anchorName = "", coanchorName = ""] = access.announcers;
  const stored = await prisma.paScript.upsert({
    where: { date },
    create: { date, content: buildPaScript(date, access.announcers), anchorName, coanchorName },
    update: {}
  });
  let content = refreshPaNames(stored.content, [stored.anchorName, stored.coanchorName], access.announcers);
  let autofill: BulletinAutofill | undefined;
  // Only fill an untouched template; refresh must never replace someone's copy.
  if (access.canEdit && content === buildPaScript(date, access.announcers)) {
    const bulletin = await loadA2Bulletin(new Date(`${date}T12:00:00Z`), { pa: true });
    autofill = bulletin.autofill.status === "ok"
      ? bulletin.autofill
      : { ...bulletin.autofill, message: bulletin.autofill.message.replaceAll("A2", "The PA script") };
    if (bulletin.announcements.length) {
      content = buildPaScript(date, access.announcers, bulletin.announcements.map((item) => item.announcement));
    }
  }
  if (content === stored.content && stored.anchorName === anchorName && stored.coanchorName === coanchorName) {
    return { ...pageData(date, access, stored), autofill };
  }
  const result = await prisma.paScript.updateMany({
    where: { date, version: stored.version },
    data: { content, anchorName, coanchorName, version: { increment: 1 } }
  });
  if (result.count !== 1) throw new Error("CONFLICT");
  return { ...pageData(date, access, { content, version: stored.version + 1 }), autofill };
}

export async function savePaScript(actor: Actor, input: { date: string; version: number } & ({ content: string } | { regenerate: true }), now = new Date()) {
  const today = paToday(now);
  if (input.date < today || input.date < PA_CALENDAR_START || input.date > PA_CALENDAR_END) throw new Error("BAD_REQUEST");
  const overrides = await scheduleOverrides(now);
  if (resolveScheduleDay(input.date, overrides).kind !== "PA") throw new Error("BAD_REQUEST");
  const access = await paAccess(actor, input.date);
  if (!access.canEdit) throw new Error("FORBIDDEN");
  const stored = await prisma.paScript.findUnique({ where: { date: input.date } });
  if (!stored) throw new Error("NOT_FOUND");
  if (stored.version !== input.version) throw new Error("CONFLICT");
  let content: string;
  let autofill: BulletinAutofill | undefined;
  if ("regenerate" in input) {
    const bulletin = await loadA2Bulletin(new Date(`${input.date}T12:00:00Z`), { pa: true });
    if (bulletin.autofill.status === "unavailable" || !bulletin.announcements.length) {
      throw new Error("PA_REGENERATE_EMPTY");
    }
    content = buildPaScript(input.date, access.announcers, bulletin.announcements.map((item) => item.announcement));
    autofill = bulletin.autofill.status === "ok"
      ? bulletin.autofill
      : { ...bulletin.autofill, message: bulletin.autofill.message.replaceAll("A2", "The PA script") };
  } else {
    content = refreshPaNames(input.content, [stored.anchorName, stored.coanchorName], access.announcers);
  }
  const [anchorName = "", coanchorName = ""] = access.announcers;
  const result = await prisma.paScript.updateMany({
    where: { date: input.date, version: input.version },
    data: { content, anchorName, coanchorName, version: { increment: 1 } }
  });
  if (result.count !== 1) throw new Error("CONFLICT");
  return { ...pageData(input.date, access, { content, version: input.version + 1 }), autofill };
}
