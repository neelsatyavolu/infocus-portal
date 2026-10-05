/**
 * Timeline of one meeting from Workers Logs (the meeting-room Worker's structured logs and the
 * clients' `diag` reports). No content or names are logged, only ids, states and counters.
 *
 *   CLOUDFLARE_ACCOUNT_ID=… \
 *   CLOUDFLARE_API_TOKEN="$(op --account E3OXZANXQRDOBNXQMPXZ6YBHTY item get afmfvibesasxmhmhilc5wa2eru --fields credential --reveal)" \
 *   npm run meetings:logs -- <meetingId|latest> [--since 2h] [--uid xyz] [--json]
 *
 * The token needs the account permission "Workers Observability: Edit" (the API docs list
 * "Workers Observability Write" for this query endpoint). "!!" marks errors, caps, rate limits and
 * failed reports.
 * Live instead: npx wrangler tail infocus-meeting-room --format json
 */
import { formatRecord, latestMeetingId, parseArgs, recordsFromEvents, type LogRecord } from "./meetings-logs-lib";

const SCRIPT_NAME = "infocus-meeting-room";
const LIMIT = 2000;

async function query(accountId: string, token: string, from: number, to: number, needle: string | null) {
  const body = {
    queryId: "meetings-logs",
    view: "events",
    limit: LIMIT,
    timeframe: { from, to },
    parameters: {
      datasets: ["cloudflare-workers"],
      filters: [{ key: "$workers.scriptName", operation: "eq", type: "string", value: SCRIPT_NAME }],
      ...(needle ? { needle: { value: needle, isRegex: false, matchCase: true } } : {})
    }
  };
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: { message?: string }[];
    result?: { events?: { events?: Record<string, unknown>[] } };
  };
  if (!response.ok || json.success === false) {
    const reason = json.errors?.map((error) => error.message).join("; ") || `HTTP ${response.status}`;
    const hint = response.status === 401 || response.status === 403 ? " (the token needs Workers Observability: Edit)" : "";
    throw new Error(`Workers Logs query failed: ${reason}${hint}`);
  }
  return json.result?.events?.events ?? [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (see the header of this file).");

  const to = Date.now();
  const from = to - args.sinceMs;
  let mid = args.target;
  if (mid === "latest") {
    const recent = recordsFromEvents(await query(accountId, token, from, to, null));
    const latest = latestMeetingId(recent);
    if (!latest) throw new Error("No meeting activity in that window. Try a longer --since.");
    mid = latest;
  }

  const events = await query(accountId, token, from, to, mid);
  const records: LogRecord[] = recordsFromEvents(events).filter(
    (record) => record.mid === mid && (!args.uid || (record.uid ?? "").startsWith(args.uid))
  );
  if (args.json) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }
  console.log(`Meeting ${mid} · ${records.length} events · since ${new Date(from).toISOString()}`);
  if (events.length >= LIMIT) console.log(`(hit the ${LIMIT}-event limit; narrow with --since or --uid)`);
  for (const record of records) console.log(formatRecord(record));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
