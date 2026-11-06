import { prisma } from "@/src/lib/prisma";
import { QUEUE_HOLD_LABEL_MAX, QUEUE_UPCOMING_SHOW_COUNT } from "@/src/lib/publishing-queue";
import { defaultKindForDateKey, holidayLabelForDateKey } from "@/src/lib/school-schedule";
import { listUpcomingShowDays } from "@/src/server/show-schedule";

/**
 * Holding a show day in the Publishing Queue names it on the calendar (a SchoolCalendarDay
 * label), which makes it a special show: auto-assign skips it, packages still go there by hand,
 * and the master calendar shows the name. For a show we will air without its file yet (a recap).
 */

async function requireUpcomingShow(date: string) {
  const upcoming = await listUpcomingShowDays(QUEUE_UPCOMING_SHOW_COUNT);
  const day = upcoming.find((show) => show.date === date);
  if (!day) throw new Error("That day isn't an upcoming show.");
  return day;
}

export async function holdShowDay(date: string, rawLabel: string) {
  const label = rawLabel.trim().slice(0, QUEUE_HOLD_LABEL_MAX);
  if (!label) throw new Error("Give the held show a name.");
  await requireUpcomingShow(date);
  return prisma.schoolCalendarDay.upsert({
    where: { date },
    create: { date, kind: "SHOW", label, source: "manual" },
    update: { kind: "SHOW", label, source: "manual" }
  });
}

/**
 * Clears the name, so auto-assign fills the day again. A row this hold created on a regular show
 * day is deleted; any other row (a switched day, or one Paly's calendar sync wrote) keeps its kind
 * as a manual row with no label, so the next sync doesn't bring the name back.
 */
export async function releaseShowDay(date: string) {
  await requireUpcomingShow(date);
  const row = await prisma.schoolCalendarDay.findUnique({ where: { date }, select: { source: true } });
  if (!row) return;
  const plainShowDay = defaultKindForDateKey(date) === "SHOW" && !holidayLabelForDateKey(date);
  if (row.source === "manual" && plainShowDay) {
    await prisma.schoolCalendarDay.deleteMany({ where: { date } });
    return;
  }
  await prisma.schoolCalendarDay.update({ where: { date }, data: { label: "", source: "manual" } });
}
