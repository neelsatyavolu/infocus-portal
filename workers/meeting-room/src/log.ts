/**
 * Structured logs for Workers Logs (observability): one JSON line per event,
 * `{ evt, mid, uid, ...details }`, so a meeting's history can be queried by `mid`.
 * Never pass tickets, keys, SDP, chat ciphertext, names or emails here.
 */

export type LogValue = string | number | boolean | null | undefined;
export type LogDetails = Record<string, LogValue>;

/** First 8 characters of a session id: enough to correlate, short in the logs. */
export function shortId(id: string | null | undefined): string | null {
  return id ? id.slice(0, 8) : null;
}

/** The log line for an event; `evt`, `mid` and `uid` always win over same-named details. */
export function logLine(evt: string, mid: string | null, uid: string | null, details: LogDetails = {}): string {
  const clean = Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
  return JSON.stringify({ ...clean, evt, mid, uid });
}

export function logEvent(evt: string, mid: string | null, uid: string | null, details: LogDetails = {}): void {
  console.log(logLine(evt, mid, uid, details));
}
