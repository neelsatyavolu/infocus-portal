import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Calendar apps can't send cookies, so a personal feed URL carries its own credential:
 * `<base64url userId>.<HMAC>`. The key is derived from APP_AUTH_SECRET with its own label, so a
 * feed token can never pass as a session or any other signed value. Bumping FEED_TOKEN_VERSION
 * (or rotating APP_AUTH_SECRET) changes every link; there is no per-user reset yet, which would
 * need a stored per-user version.
 */
const FEED_TOKEN_VERSION = "v1";
const MAX_USER_ID_LENGTH = 128;

function feedKey() {
  const secret = process.env.APP_AUTH_SECRET;
  if (!secret) throw new Error("APP_AUTH_SECRET is required.");
  return createHmac("sha256", secret).update(`infocus-calendar-feed/${FEED_TOKEN_VERSION}`).digest();
}

function signUserId(userId: string) {
  return createHmac("sha256", feedKey()).update(`${FEED_TOKEN_VERSION}:${userId}`).digest("base64url");
}

export function createCalendarFeedToken(userId: string) {
  return `${Buffer.from(userId, "utf8").toString("base64url")}.${signUserId(userId)}`;
}

/** The user id a feed token was issued for, or null when it is malformed or the signature is wrong. */
export function verifyCalendarFeedToken(token: string | null | undefined): string | null {
  if (!token || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedId, signature] = parts as [string, string];
  if (!/^[A-Za-z0-9_-]+$/.test(encodedId) || !/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  const userId = Buffer.from(encodedId, "base64url").toString("utf8");
  if (!userId || userId.length > MAX_USER_ID_LENGTH) return null;
  // Reject non-canonical encodings so one user id has exactly one valid token.
  if (Buffer.from(userId, "utf8").toString("base64url") !== encodedId) return null;
  let expected: Buffer;
  try {
    expected = Buffer.from(signUserId(userId));
  } catch {
    return null;
  }
  const candidate = Buffer.from(signature);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected) ? userId : null;
}

/** The feed path for a token. The `.ics` suffix helps calendar apps recognize the file. */
export function calendarFeedPath(token: string) {
  return `/api/calendar/${token}.ics`;
}
