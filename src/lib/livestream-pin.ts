import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { LIVESTREAM_PIN_COOKIE_NAME } from "@/src/lib/auth-cookies";
import {
  CLASS_BOARD_PIN_LENGTH,
  classBoardPinHashesMatch,
  generateClassBoardPin,
  isClassBoardPin
} from "@/src/lib/class-board-pin";

/**
 * Livestream dashboard PIN. Same shape as the Class Board PIN (6 digits, AES-GCM at rest,
 * HMAC cookie bound to the PIN hash) with its own key prefixes, so neither PIN opens the other.
 * A PIN session ends at midnight Pacific.
 */

export { LIVESTREAM_PIN_COOKIE_NAME };
export const LIVESTREAM_PIN_LENGTH = CLASS_BOARD_PIN_LENGTH;
export const isLivestreamPin = isClassBoardPin;
export const generateLivestreamPin = generateClassBoardPin;
export const livestreamPinHashesMatch = classBoardPinHashesMatch;

const MAX_SESSION_MS = 24 * 60 * 60 * 1000;
const PACIFIC = "America/Los_Angeles";

export function hashLivestreamPin(pin: string) {
  return createHash("sha256").update(`livestream-pin.v1.${pin}`).digest("hex");
}

function pinKey(secret: string) {
  return createHash("sha256").update(`livestream-pin-key.v1.${secret}`).digest();
}

export function encryptLivestreamPin(pin: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pinKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptLivestreamPin(payload: string, secret: string) {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", pinKey(secret), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const pin = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
    return isLivestreamPin(pin) ? pin : null;
  } catch {
    return null;
  }
}

/** Milliseconds until the next midnight in Pacific time (at least one minute). */
export function msUntilPacificMidnight(now: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23"
  }).formatToParts(new Date(now));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const elapsed = (value("hour") * 3600 + value("minute") * 60 + value("second")) * 1000;
  return Math.max(60_000, 24 * 60 * 60 * 1000 - elapsed);
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`livestream-pin.v1.${payload}`).digest("base64url");
}

export function createLivestreamPinToken(pinHash: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ scope: "livestream", pinHash, exp: now + msUntilPacificMidnight(now) })
  ).toString("base64url");
  return `${payload}.${signPayload(payload, secret)}`;
}

export function readLivestreamPinToken(token: string | null | undefined, secret: string, now = Date.now()) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = Buffer.from(signPayload(parts[0], secret));
  const supplied = Buffer.from(parts[1]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as {
      scope?: unknown;
      pinHash?: unknown;
      exp?: unknown;
    };
    if (value.scope !== "livestream" || typeof value.pinHash !== "string" || typeof value.exp !== "number") return null;
    if (value.exp <= now || value.exp > now + MAX_SESSION_MS) return null;
    return { pinHash: value.pinHash, exp: value.exp };
  } catch {
    return null;
  }
}

export function livestreamPinCookieMatches(
  token: string | null | undefined,
  pinHash: string | null | undefined,
  secret: string,
  now = Date.now()
) {
  const parsed = readLivestreamPinToken(token, secret, now);
  if (!parsed || !pinHash) return false;
  return livestreamPinHashesMatch(parsed.pinHash, pinHash);
}

export function getLivestreamPinCookieMeta(now = Date.now()) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    path: "/",
    maxAge: Math.floor(msUntilPacificMidnight(now) / 1000)
  };
}
