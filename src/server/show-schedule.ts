import { prisma } from "@/src/lib/prisma";
import {
  addDaysToDateKey,
  listUpcomingShowDates,
  nextUpcomingShowDate,
  todayDateKey,
  type ScheduleOverrideMap
} from "@/src/lib/show-assignment";
import { resolveScheduleDay, type ScheduleKind } from "@/src/lib/school-schedule";

export async function loadScheduleOverrides(fromKey: string, toKey: string): Promise<ScheduleOverrideMap> {
  const rows = await prisma.schoolCalendarDay.findMany({
    where: { date: { gte: fromKey, lte: toKey } },
    select: { date: true, kind: true, label: true }
  });
  return new Map(
    rows.map((row) => [row.date, { kind: row.kind as ScheduleKind, label: row.label }])
  );
}

export async function listUpcomingShows(count = 8, from = new Date()) {
  const fromKey = todayDateKey(from);
  const endKey = addDaysToDateKey(fromKey, 90);
  const overrides = await loadScheduleOverrides(fromKey, endKey);
  return listUpcomingShowDates(fromKey, count, overrides);
}

/** Upcoming show days with their calendar labels (special shows have one). */
export async function listUpcomingShowDays(count = 8, from = new Date()) {
  const fromKey = todayDateKey(from);
  const endKey = addDaysToDateKey(fromKey, 90);
  const overrides = await loadScheduleOverrides(fromKey, endKey);
  return listUpcomingShowDates(fromKey, count, overrides).map((date) => resolveScheduleDay(date, overrides));
}

export async function resolveNextShowDate(from = new Date()) {
  const fromKey = todayDateKey(from);
  const endKey = addDaysToDateKey(fromKey, 90);
  const overrides = await loadScheduleOverrides(fromKey, endKey);
  return nextUpcomingShowDate(fromKey, overrides);
}
