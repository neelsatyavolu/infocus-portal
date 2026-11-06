import type { Prisma } from "@prisma/client";
import { finalCutDeadlinePassed } from "@/src/lib/deadlines";
import { parseProgramConfig } from "@/src/lib/program-config";
import { prisma } from "@/src/lib/prisma";
import { CUSTOM_QUEUE_CYCLE_NUMBER, CUSTOM_QUEUE_GROUP_TYPE } from "@/src/lib/publishing-queue";
import { projectOverflow, type ProjectionShowDay } from "@/src/lib/publishing-queue-projection";
import { isSpecialShowDay, resolveScheduleDay } from "@/src/lib/school-schedule";
import { FIRST_SHOW_DATE, addDaysToDateKey, todayDateKey } from "@/src/lib/show-assignment";
import { getProgramSettings } from "@/src/server/program-settings";
import { loadScheduleOverrides } from "@/src/server/show-schedule";

const ROSTER_PACKAGE = {
  cycleNumber: { gt: CUSTOM_QUEUE_CYCLE_NUMBER },
  groupTopic: { not: "" }
} satisfies Prisma.PackageProgressRowWhereInput;
const CUSTOM_PACKAGE = {
  OR: [{ cycleNumber: CUSTOM_QUEUE_CYCLE_NUMBER }, { groupType: CUSTOM_QUEUE_GROUP_TYPE }]
} satisfies Prisma.PackageProgressRowWhereInput;

async function remainingShowDays(today: string, lastDay: string): Promise<ProjectionShowDay[]> {
  const overrides = await loadScheduleOverrides(today, lastDay);
  const days: ProjectionShowDay[] = [];
  const start = today < FIRST_SHOW_DATE ? FIRST_SHOW_DATE : today;
  for (let date = start; date <= lastDay; date = addDaysToDateKey(date, 1)) {
    const day = resolveScheduleDay(date, overrides);
    if (day.kind === "SHOW") days.push({ date, special: isSpecialShowDay(day) });
  }
  return days;
}

/** Producers' overflow tile on the Publishing Queue. Null outside a school year or before any cycle has packages. */
export async function loadOverflowProjection(now = new Date()) {
  const today = todayDateKey(now);
  const settings = await getProgramSettings();
  const year = [...parseProgramConfig(settings.config).schoolYears]
    .sort((a, b) => a.firstDay.localeCompare(b.firstDay))
    .find((entry) => entry.lastDay >= today);
  if (!year) return null;

  const [cycles, counts, airedPackages, upcomingCustomPackages, showDays] = await Promise.all([
    prisma.packageCycle.findMany({ select: { cycleNumber: true, finalCutDate: true } }),
    prisma.packageProgressRow.groupBy({ by: ["cycleNumber"], where: ROSTER_PACKAGE, _count: { _all: true } }),
    prisma.packageProgressRow.count({
      where: { ...ROSTER_PACKAGE, queuedForAirAt: { not: null }, queuedForShowDate: { lt: today } }
    }),
    prisma.packageProgressRow.count({
      where: {
        AND: [CUSTOM_PACKAGE, { OR: [{ queuedForShowDate: null }, { queuedForShowDate: { gte: today } }] }],
        queuedForAirAt: { not: null }
      }
    }),
    remainingShowDays(today, year.lastDay)
  ]);

  const finalCutDates = new Map(cycles.map((cycle) => [cycle.cycleNumber, cycle.finalCutDate]));
  return projectOverflow({
    cycles: counts.map((row) => ({
      cycleNumber: row.cycleNumber,
      packages: row._count._all,
      finished: finalCutDeadlinePassed(finalCutDates.get(row.cycleNumber), now)
    })),
    cyclesInYear: settings.cyclesPerSemester * 2,
    airedPackages,
    upcomingCustomPackages,
    showDays,
    secondSemesterStart: year.secondSemesterFirstShowDate ?? null,
    lastDay: year.lastDay
  });
}
