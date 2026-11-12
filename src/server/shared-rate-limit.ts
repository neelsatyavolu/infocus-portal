import { prisma } from "@/src/lib/prisma";
import { limitByKey } from "@/src/lib/rate-limit";

type RateLimitConfig = { max: number; windowMs: number };

/** About one call in 50 also clears up to 50 expired buckets, so the table never needs a cron. */
const CLEANUP_CHANCE = 0.02;

/**
 * A rate limit shared by every Worker isolate, kept in the RateLimitBucket table. One statement
 * creates the bucket, counts the call, or starts a new window once the old one has passed, so two
 * isolates can't both read a stale count. Times are the database's clock, in UTC like Prisma's.
 * If the database call fails, this falls back to the per-isolate limiter rather than blocking.
 */
export async function checkSharedRateLimit(key: string, config: RateLimitConfig) {
  let count: number;
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, (NOW() AT TIME ZONE 'UTC') + (CAST(${config.windowMs} AS double precision) * INTERVAL '1 millisecond'))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."resetAt" <= (NOW() AT TIME ZONE 'UTC') THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimitBucket"."resetAt" <= (NOW() AT TIME ZONE 'UTC') THEN EXCLUDED."resetAt"
          ELSE "RateLimitBucket"."resetAt"
        END
      RETURNING "count"`;
    count = Number(rows[0]?.count ?? 1);
  } catch (error) {
    console.error("Shared rate limit unavailable; using the per-isolate limit", { key, error });
    return limitByKey(key, config);
  }

  if (Math.random() < CLEANUP_CHANCE) {
    await deleteExpiredBuckets();
  }

  return { allowed: count <= config.max, remaining: Math.max(0, config.max - count) };
}

async function deleteExpiredBuckets() {
  try {
    await prisma.$executeRaw`
      DELETE FROM "RateLimitBucket"
      WHERE "key" IN (
        SELECT "key" FROM "RateLimitBucket"
        WHERE "resetAt" < (NOW() AT TIME ZONE 'UTC')
        LIMIT 50
      )`;
  } catch (error) {
    console.error("Rate limit cleanup failed", error);
  }
}
