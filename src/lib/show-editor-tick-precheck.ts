import { Client } from "pg";

/**
 * runShowEditEscalations' filter (src/server/show-editor-escalation.ts) in plain SQL, narrowed to when it can
 * act: an edit at Review for today's show, or for tomorrow's once the 8:00 AM deadline is about 12 hours off.
 */
export const SHOW_EDIT_TICK_SQL = `SELECT 1 FROM "ShowEditJob"
WHERE "status" = 'REVIEW' AND "showDate" >= $1 AND "showDate" <= $2
LIMIT 1`;

/** Tomorrow's show joins at 7 PM Pacific: 8 AM minus 12 hours, an hour early for DST nights. */
const TOMORROW_FROM_HOUR = 19;

const pacificDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
const pacificHour = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" });

/** The show dates (Pacific YYYY-MM-DD, first and last) the tick can act on now. */
export function showEditTickWindow(now = new Date()) {
  const today = pacificDay.format(now);
  const tomorrow = pacificDay.format(new Date(now.getTime() + 24 * 60 * 60_000));
  return [today, Number(pacificHour.format(now)) >= TOMORROW_FROM_HOUR ? tomorrow : today] as const;
}

/** Run by the Worker's cron before it loads Next.js for the show-editor tick: one small query over Hyperdrive. */
export async function showEditTickHasWork(connectionString: string, now = new Date()) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(SHOW_EDIT_TICK_SQL, [...showEditTickWindow(now)]);
    return result.rows.length > 0;
  } finally {
    await client.end();
  }
}
