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

export function getRequestKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `${scope}:${ip}`;
}
