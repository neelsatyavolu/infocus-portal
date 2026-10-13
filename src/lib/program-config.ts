import { z } from "zod";
import { FIRST_SHOW_DATE } from "@/src/lib/school-schedule";

/**
 * Program configuration that execs and the adviser edit in Admin → Configuration.
 * Stored as JSON on ProgramSetting.config. Every field has a default equal to what the
 * Portal did before the setting existed, so an empty config changes nothing.
 */
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const schoolYearSchema = z
  .object({
    /** First day of school. */
    firstDay: dateKey,
    /** Last day of school. */
    lastDay: dateKey,
    /** First broadcast show. Earlier Wednesdays and Fridays are not show days. */
    firstShowDate: dateKey,
    /** "feed" when the Portal read the year from Paly's calendar and nobody has confirmed it yet. */
    source: z.enum(["manual", "feed"]).default("manual")
  })
  .refine((year) => year.firstDay <= year.firstShowDate && year.firstShowDate <= year.lastDay, {
    message: "The first show must fall between the first and last day of school."
  });

export type SchoolYear = z.infer<typeof schoolYearSchema>;

export const DEFAULT_SCHOOL_YEARS: readonly SchoolYear[] = [
  { firstDay: "2026-08-13", lastDay: "2027-06-03", firstShowDate: FIRST_SHOW_DATE, source: "manual" }
];

const calendarSyncSchema = z.object({
  /** ISO time of the last run. */
  at: z.string(),
  ok: z.boolean(),
  /** Finals days Paly's calendar listed on that run. */
  finalsDates: z.array(dateKey),
  /** Why the run failed, in plain words. Empty when it worked. */
  message: z.string()
});

export type CalendarSyncStatus = z.infer<typeof calendarSyncSchema>;

export const programConfigSchema = z.object({
  schoolYears: z.array(schoolYearSchema).min(1).max(12).default([...DEFAULT_SCHOOL_YEARS]),
  calendarSync: calendarSyncSchema.nullable().default(null)
});

export type ProgramConfig = z.infer<typeof programConfigSchema>;

/** Stored JSON → config. Anything unreadable falls back to the defaults instead of breaking a page. */
export function parseProgramConfig(value: unknown): ProgramConfig {
  const parsed = programConfigSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : programConfigSchema.parse({});
}

/** Oldest first. Throws BAD_REQUEST when two years overlap. */
export function orderSchoolYears(years: readonly SchoolYear[]): SchoolYear[] {
  const ordered = [...years].sort((a, b) => a.firstDay.localeCompare(b.firstDay));
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].firstDay <= ordered[index - 1].lastDay) {
      throw new Error("BAD_REQUEST");
    }
  }
  return ordered;
}
