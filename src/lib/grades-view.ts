/** Shared by the /grades server page (first paint) and its client view. */

import { pacificDateKey } from "@/src/lib/deadlines";

export const GRADE_TABS = ["home", "packages", "participation", "other", "all"] as const;
export type GradeTab = (typeof GRADE_TABS)[number];

/** A `?tab=` value as a known tab, defaulting to Home. */
export function parseGradeTab(value: string | string[] | null | undefined): GradeTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return GRADE_TABS.find((tab) => tab === raw) ?? "home";
}

/** Pacific calendar day, so Sunday evening still belongs to the current participation week. */
export function gradebookTodayKey(now = new Date()) {
  return pacificDateKey(now);
}

/** The participation week containing `today` (YYYY-MM-DD), else the last week, else 0. */
export function currentGradebookWeekIndex(weeks: Array<{ weekStart: string }>, today: string) {
  if (weeks.length === 0) return 0;
  const current = weeks.findIndex((week, index) => {
    const nextStart = weeks[index + 1]?.weekStart;
    return week.weekStart <= today && (!nextStart || nextStart > today);
  });
  return current >= 0 ? current : weeks.length - 1;
}
