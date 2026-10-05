/** Pure helpers for scripts/meetings-logs.ts (parsing args and Workers Logs events, formatting a timeline). */

export type LogsArgs = { target: string; sinceMs: number; uid: string | null; json: boolean };

export type LogRecord = { at: number; evt: string; mid: string | null; uid: string | null; fields: Record<string, unknown> };

const UNITS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseDuration(value: string) {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) throw new Error(`Bad duration "${value}" (use e.g. 30m, 2h, 1d).`);
  return Number(match[1]) * UNITS[match[2]!]!;
}

export function parseArgs(argv: readonly string[]): LogsArgs {
  const args: LogsArgs = { target: "", sinceMs: parseDuration("2h"), uid: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--since") args.sinceMs = parseDuration(argv[++i] ?? "");
    else if (arg === "--uid") args.uid = argv[++i] ?? null;
    else if (arg === "--json") args.json = true;
    else if (!arg.startsWith("--") && !args.target) args.target = arg;
    else throw new Error(`Unknown argument "${arg}".`);
  }
  if (!args.target) throw new Error("Usage: npm run meetings:logs -- <meetingId|latest> [--since 2h] [--uid xyz] [--json]");
  return args;
}

/** The room's one-line JSON logs, from an events-view result (`source` may be parsed or a string). */
export function recordsFromEvents(events: readonly Record<string, unknown>[]): LogRecord[] {
  const records: LogRecord[] = [];
  for (const event of events) {
    let payload: unknown = event.source;
    const metadata = event.$metadata as { message?: unknown } | undefined;
    if (typeof payload === "string" || payload === undefined) {
      const text = typeof payload === "string" ? payload : typeof metadata?.message === "string" ? metadata.message : "";
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { evt: "raw", message: text };
      }
    }
    if (typeof payload !== "object" || payload === null) continue;
    const { evt, mid, uid, ...fields } = payload as Record<string, unknown>;
    if (typeof evt !== "string") continue;
    records.push({
      at: typeof event.timestamp === "number" ? event.timestamp : 0,
      evt,
      mid: typeof mid === "string" ? mid : null,
      uid: typeof uid === "string" ? uid : null,
      fields
    });
  }
  return records.sort((a, b) => a.at - b.at);
}

export function latestMeetingId(records: readonly LogRecord[]) {
  return [...records].reverse().find((record) => record.mid)?.mid ?? null;
}

/** Errors, caps, rate limits, failed/disconnected states and failed reports stand out. */
export function isProblem(record: LogRecord) {
  const { evt, fields } = record;
  if (["media_denied", "session_cap", "rate_limited", "socket_rejected", "socket_error", "room_cleared"].includes(evt)) return true;
  if (evt === "proxy" && typeof fields.status === "number" && fields.status >= 400) return true;
  if (evt === "report" && fields.ok === false) return true;
  if (evt === "client" && fields.kind === "event") {
    return /fail|error|rejected|retry/.test(String(fields.what ?? "")) || fields.pc === "failed" || fields.pc === "disconnected";
  }
  return false;
}

function formatValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function formatRecord(record: LogRecord) {
  const time = new Date(record.at).toISOString().slice(11, 23);
  const who = (record.uid ?? "—").slice(0, 10).padEnd(10);
  const label = record.evt === "client" ? `client:${formatValue(record.fields.what ?? record.fields.kind)}` : record.evt;
  const details = Object.entries(record.fields)
    .filter(([key]) => !(record.evt === "client" && (key === "what" || key === "kind")))
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
  const flag = isProblem(record) ? "!!" : "  ";
  return `${flag} ${time} ${who} ${label.padEnd(22)} ${details}`;
}
