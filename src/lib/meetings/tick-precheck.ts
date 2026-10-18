import { Client } from "pg";

/** Longest reminder lead (MEETING_REMINDERS in src/server/meetings-notify.ts; a test keeps them equal). */
export const TICK_REMINDER_HORIZON_MINUTES = 15;

/**
 * The same check as meetingTickHasWork (src/server/meetings-service.ts) in plain SQL: live meetings,
 * notes still recording or processing, and meetings starting within the longest reminder lead.
 */
export const TICK_HAS_WORK_SQL = `SELECT 1 FROM "Meeting"
WHERE "status" = 'LIVE'
  OR "notesStatus" IN ('RECORDING', 'PROCESSING')
  OR ("status" = 'SCHEDULED' AND "startsAt" > $1 AND "startsAt" <= $2)
LIMIT 1`;

/**
 * Run by the Worker's cron before it hands the tick to Next.js. Loading the Next.js server costs
 * ~300 ms of CPU in a fresh isolate; this is one small query over Hyperdrive.
 */
export async function meetingTickHasWork(connectionString: string, now = new Date()) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const horizon = new Date(now.getTime() + TICK_REMINDER_HORIZON_MINUTES * 60 * 1000);
    const result = await client.query(TICK_HAS_WORK_SQL, [now, horizon]);
    return result.rows.length > 0;
  } finally {
    await client.end();
  }
}
