type Bucket = {
  count: number;
  resetsAt: number;
};

const store = new Map<string, Bucket>();

export function limitByKey(
  key: string,
  config: {
    max: number;
    windowMs: number;
  }
) {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || bucket.resetsAt <= now) {
    store.set(key, {
      count: 1,
      resetsAt: now + config.windowMs
    });
    return { allowed: true, remaining: config.max - 1 };
  }

  if (bucket.count >= config.max) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  store.set(key, bucket);

  return { allowed: true, remaining: config.max - bucket.count };
}

/**
 * The caller's address. Cloudflare sets cf-connecting-ip and overwrites any value a client sends;
 * the first x-forwarded-for entry is whatever the client wrote, so only the last one (added by the
 * nearest proxy) is used as a fallback.
 */
export function getClientIp(request: Request) {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  return forwarded?.at(-1) || "unknown";
}

export function getRequestKey(request: Request, scope: string) {
  return `${scope}:${getClientIp(request)}`;
}
