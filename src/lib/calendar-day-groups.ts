import { addDaysToDateKey } from "@/src/lib/show-assignment";

export type CalendarDayRow = { date: string; kind: string; label: string; source: string };
export type CalendarDayGroup = { from: string; to: string; kind: string; label: string; source: string; dates: string[] };

/**
 * Collapses runs of like days (same kind, label and source, at most a weekend apart) into one
 * row, so a ten-week summer reads as one line instead of fifty.
 */
export function groupCalendarDays(rows: readonly CalendarDayRow[]): CalendarDayGroup[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.reduce<CalendarDayGroup[]>((groups, row) => {
    const last = groups[groups.length - 1];
    const joins =
      last &&
      last.kind === row.kind &&
      last.label === row.label &&
      last.source === row.source &&
      row.date <= addDaysToDateKey(last.to, 3);
    if (!joins) {
      return [...groups, { from: row.date, to: row.date, kind: row.kind, label: row.label, source: row.source, dates: [row.date] }];
    }
    return [...groups.slice(0, -1), { ...last, to: row.date, dates: [...last.dates, row.date] }];
  }, []);
}
