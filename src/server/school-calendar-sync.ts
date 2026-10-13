import { pacificDateKey } from "@/src/lib/deadlines";
import { orderSchoolYears, type CalendarSyncStatus, type SchoolYear } from "@/src/lib/program-config";
import { prisma } from "@/src/lib/prisma";
import {
  SCHOOL_YEAR_SOURCE,
  planSchoolYearSync,
  schoolYearDays,
  schoolYearFromFeed,
  schoolYearsThrough
} from "@/src/lib/school-year-days";
import { addDaysToDateKey } from "@/src/lib/show-assignment";
import { applyFinalsWeeks } from "@/src/server/finals-calendar-sync";
import { fetchPalyBellFeed, parsePalySchoolDays } from "@/src/server/paly-bell-schedule";
import { getProgramConfig, updateProgramConfig } from "@/src/server/program-settings";

/** How far ahead the generated calendar reaches. */
const LOOKAHEAD_DAYS = 400;

/**
 * Writes the days the school years imply (summer, and no shows before the first show) to the
 * school calendar. Only upcoming generated rows change.
 */
export async function applySchoolYears(years: readonly SchoolYear[], now = new Date()) {
  const today = pacificDateKey(now);
  const days = schoolYearDays(schoolYearsThrough(years, addDaysToDateKey(today, LOOKAHEAD_DAYS)));
  const existing = await prisma.schoolCalendarDay.findMany({ select: { date: true, source: true } });
  const plan = planSchoolYearSync({ days, existing, today });

  if (plan.upsert.length > 0) {
    await prisma.schoolCalendarDay.createMany({
      data: plan.upsert.map((day) => ({ ...day, source: SCHOOL_YEAR_SOURCE })),
      skipDuplicates: true
    });
    // One update per kind of day (there are two: a class day before the first show, and summer).
    const groups = new Map<string, { kind: string; label: string; dates: string[] }>();
    for (const day of plan.upsert) {
      const key = `${day.kind}|${day.label}`;
      const group = groups.get(key) ?? { kind: day.kind, label: day.label, dates: [] };
      groups.set(key, { ...group, dates: [...group.dates, day.date] });
    }
    for (const group of groups.values()) {
      await prisma.schoolCalendarDay.updateMany({
        where: { date: { in: group.dates }, source: SCHOOL_YEAR_SOURCE },
        data: { kind: group.kind, label: group.label }
      });
    }
  }
  if (plan.remove.length > 0) {
    await prisma.schoolCalendarDay.deleteMany({ where: { date: { in: plan.remove }, source: SCHOOL_YEAR_SOURCE } });
  }

  return { written: plan.upsert.length, removed: plan.remove.length };
}

/**
 * The daily calendar sync, also run by Sync now in Admin → Configuration:
 * 1. reads Paly's bell schedule,
 * 2. saves a new school year the first time the schedule lists one,
 * 3. writes summer and pre-first-show days from the school years,
 * 4. marks finals weeks.
 * When Paly's calendar cannot be read, steps 2 and 4 are skipped and the status says why.
 */
export async function syncSchoolCalendar(now = new Date()): Promise<CalendarSyncStatus> {
  let ics: string | null = null;
  let message = "";
  try {
    ics = await fetchPalyBellFeed();
  } catch (error) {
    console.error("School calendar sync could not read the bell schedule", error);
    message = "Paly's calendar could not be read. Finals weeks were left as they are.";
  }

  let years = (await getProgramConfig()).schoolYears;
  let finalsDates: string[] = [];
  if (ics) {
    try {
      const added = schoolYearFromFeed(parsePalySchoolDays(ics), years);
      if (added) {
        years = orderSchoolYears([...years, added]);
        await updateProgramConfig({ schoolYears: years });
      }
    } catch (error) {
      console.error("School calendar sync could not read school days from the bell schedule", error);
      message = "Paly's calendar was read, but its school days could not be understood.";
    }
  }

  await applySchoolYears(years, now);

  if (ics) {
    try {
      finalsDates = (await applyFinalsWeeks(ics, now)).finalsDates;
    } catch (error) {
      console.error("School calendar sync could not apply finals weeks", error);
      message = "Paly's calendar was read, but its finals days could not be understood.";
    }
  }

  const status: CalendarSyncStatus = { at: now.toISOString(), ok: message === "", finalsDates, message };
  await updateProgramConfig({ calendarSync: status });
  return status;
}
