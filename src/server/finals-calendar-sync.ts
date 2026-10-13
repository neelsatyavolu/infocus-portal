import { pacificDateKey } from "@/src/lib/deadlines";
import { FINALS_FEED_SOURCE, FINALS_WEEK_LABEL, planFinalsSync } from "@/src/lib/finals-weeks";
import { prisma } from "@/src/lib/prisma";
import { fetchPalyBellFeed, parsePalyFinalsDates } from "@/src/server/paly-bell-schedule";

/**
 * Reads this year's finals days from Paly's bell schedule and marks each finals week on the
 * school calendar, so shows, PA and participation skip it. Only feed rows are written or
 * removed; a day someone set by hand is never touched. Throws when the feed cannot be read.
 */
export async function syncFinalsWeeks(now = new Date()) {
  const finalsDates = parsePalyFinalsDates(await fetchPalyBellFeed());
  const existing = await prisma.schoolCalendarDay.findMany({ select: { date: true, source: true } });
  const plan = planFinalsSync({ finalsDates, existing, today: pacificDateKey(now) });
  const day = { kind: "HOLIDAY", label: FINALS_WEEK_LABEL };

  if (plan.upsert.length > 0) {
    await prisma.schoolCalendarDay.createMany({
      data: plan.upsert.map((date) => ({ date, ...day, source: FINALS_FEED_SOURCE })),
      skipDuplicates: true
    });
    await prisma.schoolCalendarDay.updateMany({
      where: { date: { in: plan.upsert }, source: FINALS_FEED_SOURCE },
      data: day
    });
  }
  if (plan.remove.length > 0) {
    await prisma.schoolCalendarDay.deleteMany({ where: { date: { in: plan.remove }, source: FINALS_FEED_SOURCE } });
  }

  return { finalsDates, written: plan.upsert.length, removed: plan.remove.length };
}
