import { pacificDateKey } from "@/src/lib/deadlines";
import { FINALS_FEED_SOURCE, FINALS_WEEK_LABEL, planFinalsSync } from "@/src/lib/finals-weeks";
import { prisma } from "@/src/lib/prisma";
import { SCHOOL_YEAR_SOURCE } from "@/src/lib/school-year-days";
import { fetchPalyBellFeed, parsePalyFinalsDates } from "@/src/server/paly-bell-schedule";

/**
 * Marks each finals week in `ics` (Paly's bell schedule) on the school calendar, so shows, PA
 * and participation skip it. Only generated rows are written or removed; a day someone set by
 * hand is never touched.
 */
export async function applyFinalsWeeks(ics: string, now = new Date()) {
  const finalsDates = parsePalyFinalsDates(ics);
  const existing = await prisma.schoolCalendarDay.findMany({ select: { date: true, source: true } });
  const plan = planFinalsSync({ finalsDates, existing, today: pacificDateKey(now) });
  const day = { kind: "HOLIDAY", label: FINALS_WEEK_LABEL, source: FINALS_FEED_SOURCE };

  if (plan.upsert.length > 0) {
    await prisma.schoolCalendarDay.createMany({
      data: plan.upsert.map((date) => ({ date, ...day })),
      skipDuplicates: true
    });
    await prisma.schoolCalendarDay.updateMany({
      where: { date: { in: plan.upsert }, source: { in: [FINALS_FEED_SOURCE, SCHOOL_YEAR_SOURCE] } },
      data: day
    });
  }
  if (plan.remove.length > 0) {
    await prisma.schoolCalendarDay.deleteMany({ where: { date: { in: plan.remove }, source: FINALS_FEED_SOURCE } });
  }

  return { finalsDates, written: plan.upsert.length, removed: plan.remove.length };
}

/** Reads Paly's bell schedule and applies its finals weeks. Throws when the feed cannot be read. */
export async function syncFinalsWeeks(now = new Date()) {
  return applyFinalsWeeks(await fetchPalyBellFeed(), now);
}
