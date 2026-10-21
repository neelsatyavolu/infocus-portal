const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX = 20;
const attempts = new Map<string, number[]>();

/**
 * Per-address guard for the editor's unauthenticated routes (pairing codes, Mac linking): 20 calls per
 * 10 minutes per route family by default. It's per Worker isolate, so it slows guessing rather than capping it;
 * the codes' size and short life are what make guessing hopeless.
 */
export function editorRateLimited(bucket: string, ip: string, now = new Date(), max = RATE_MAX) {
  const key = `${bucket}:${ip}`;
  const since = now.getTime() - RATE_WINDOW_MS;
  const recent = (attempts.get(key) ?? []).filter((at) => at > since);
  if (recent.length >= max) {
    attempts.set(key, recent);
    return true;
  }
  recent.push(now.getTime());
  attempts.set(key, recent);
  if (attempts.size > 5000) attempts.clear();
  return false;
}

export function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
