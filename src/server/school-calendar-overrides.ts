import { cache } from "react";
import { prisma } from "@/src/lib/prisma";
import type { ScheduleKind } from "@/src/lib/school-schedule";

/**
 * School calendar overrides (date → schedule kind), deduped per request so the grade
 * summary and gradebook extras on one page share a single read. Callers must not mutate it.
 */
export const loadScheduleOverrides = cache(async (): Promise<ReadonlyMap<string, ScheduleKind>> => {
  const rows = await prisma.schoolCalendarDay.findMany({
    select: { date: true, kind: true }
  });
  const map = new Map<string, ScheduleKind>();
  for (const row of rows) {
    map.set(row.date, row.kind as ScheduleKind);
  }
  return map;
});
