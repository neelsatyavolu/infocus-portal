import ICAL from "ical.js";
import { pacificDayStart, type ClassBoardClassSession } from "@/src/lib/class-board";

// Public Bell Schedule subscription linked from Paly's Daily Bell Schedule page.
const PALY_BELL_FEED = "https://www.paly.net/fs/calendar-manager/events.ics?feed_id=ce90a21c-b072-42f2-ab19-5b5bb53eda04";

function periodOneMinutes(description: string) {
  const text = description.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|#160);/g, " ").replace(/&(?:ndash|mdash);/g, "-");
  const match = text.match(/\b(?:1(?:st)?\s+Period|First\s+Period|Period\s+1)\s*(?:Final)?\s*[:(]?\s*(\d{1,2}):([0-5]\d)\s*(AM|PM)?\s*[-–—]\s*(\d{1,2}):([0-5]\d)\s*(AM|PM)?/i);
  if (!match) return null;
  const minutes = (hour: string, minute: string, meridiem?: string) => {
    const h = Number(hour);
    if (h > 23 || (meridiem && (h < 1 || h > 12))) return NaN;
    return (meridiem ? h % 12 + (meridiem.toUpperCase() === "PM" ? 12 : 0) : h) * 60 + Number(minute);
  };
  const start = minutes(match[1], match[2], match[3]);
  let end = minutes(match[4], match[5], match[6]);
  if (!match[6] && end <= start && Number(match[4]) < 12) end += 12 * 60;
  if (!Number.isFinite(start + end) || start < 6 * 60 || end <= start || end - start > 4 * 60) return null;
  return { start, end };
}

export function parsePalyClassSessions(ics: string, from: string, until: string): ClassBoardClassSession[] {
  const calendar = new ICAL.Component(ICAL.parse(ics));
  if (calendar.name !== "vcalendar") throw new Error("Invalid bell schedule feed");
  const byDate = new Map<string, { priority: number; periods: Array<ReturnType<typeof periodOneMinutes>> }>();

  for (const component of calendar.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(component);
    if (event.isRecurrenceException()) continue;
    const recurring = event.isRecurring();
    const iterator = event.iterator();
    // Bound expansion of external recurrence rules. Only the requested window is retained.
    for (let count = 0; count < 5000; count += 1) {
      const occurrence = iterator.next();
      if (!occurrence || occurrence.toString().slice(0, 10) >= until) break;
      const details = event.getOccurrenceDetails(occurrence);
      const date = details.startDate.toString().slice(0, 10);
      if (date < from || date >= until) continue;
      const item = details.item;
      const priority = item.isRecurrenceException() ? 2 : recurring ? 0 : 1;
      const period = item.component.getFirstPropertyValue("status") === "CANCELLED" || /\bno school\b/i.test(item.summary)
        ? null : periodOneMinutes(item.description ?? "");
      const current = byDate.get(date);
      if (!current || priority > current.priority) byDate.set(date, { priority, periods: [period] });
      else if (priority === current.priority) current.periods.push(period);
    }
  }

  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).flatMap(([date, { periods }]) => {
    const period = periods[0];
    // An unknown, cancelled, or conflicting replacement must not use regular hours.
    if (!period || periods.some((other) => !other || other.start !== period.start || other.end !== period.end)) return [];
    const midnight = pacificDayStart(date).getTime();
    return [{
      date,
      startsAt: new Date(midnight + period.start * 60_000).toISOString(),
      endsAt: new Date(midnight + period.end * 60_000).toISOString()
    }];
  });
}

export async function loadPalyClassSessions(from: string, until: string): Promise<ClassBoardClassSession[]> {
  try {
    const response = await fetch(PALY_BELL_FEED, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    return parsePalyClassSessions(await response.text(), from, until);
  } catch {
    return [];
  }
}
