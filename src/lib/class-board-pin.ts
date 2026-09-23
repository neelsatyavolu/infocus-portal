import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { CLASS_BOARD_PIN_COOKIE_NAME } from "@/src/lib/auth-cookies";

export { CLASS_BOARD_PIN_COOKIE_NAME };

export const CLASS_BOARD_PIN_LENGTH = 6;
export const CLASS_BOARD_PIN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const CLASS_BOARD_PIN_MAX_FAILURES = 20;
export const CLASS_BOARD_PIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;

const PIN_PATTERN = new RegExp(`^\\d{${CLASS_BOARD_PIN_LENGTH}}$`);

export function isClassBoardPin(value: string) {
  return PIN_PATTERN.test(value);
}

export function generateClassBoardPin() {
  return randomInt(0, 10 ** CLASS_BOARD_PIN_LENGTH).toString().padStart(CLASS_BOARD_PIN_LENGTH, "0");
}

export function hashClassBoardPin(pin: string) {
  return createHash("sha256").update(`class-board-pin.v1.${pin}`).digest("hex");
}

function pinKey(secret: string) {
  return createHash("sha256").update(`class-board-pin-key.v1.${secret}`).digest();
}

export function encryptClassBoardPin(pin: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pinKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptClassBoardPin(payload: string, secret: string) {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", pinKey(secret), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const pin = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final()
    ]).toString("utf8");
    return isClassBoardPin(pin) ? pin : null;
  } catch {
    return null;
  }
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`class-board-pin.v1.${payload}`).digest("base64url");
}

export function createClassBoardPinToken(pinHash: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    scope: "class-board",
    pinHash,
    exp: now + CLASS_BOARD_PIN_MAX_AGE_SECONDS * 1000
  })).toString("base64url");
  return `${payload}.${signPayload(payload, secret)}`;
}

export function readClassBoardPinToken(token: string | null | undefined, secret: string, now = Date.now()) {
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
    if (value.scope !== "class-board" || typeof value.pinHash !== "string" || typeof value.exp !== "number") {
      return null;
    }
    if (value.exp <= now || value.exp > now + CLASS_BOARD_PIN_MAX_AGE_SECONDS * 1000) return null;
    return { pinHash: value.pinHash, exp: value.exp };
  } catch {
    return null;
  }
}

export function classBoardPinHashesMatch(left: string, right: string) {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function classBoardPinCookieMatches(
  token: string | null | undefined,
  pinHash: string | null | undefined,
  secret: string,
  now = Date.now()
) {
  const parsed = readClassBoardPinToken(token, secret, now);
  if (!parsed || !pinHash || parsed.pinHash.length !== pinHash.length) return false;
  return timingSafeEqual(Buffer.from(parsed.pinHash), Buffer.from(pinHash));
}

export function getClassBoardPinCookieMeta() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    path: "/class-board",
    maxAge: CLASS_BOARD_PIN_MAX_AGE_SECONDS
  };
}

export function pinAttemptLocked(input: {
  failures: number;
  failureAt: Date | null;
  now: number;
}) {
  if (input.failures < CLASS_BOARD_PIN_MAX_FAILURES || !input.failureAt) return false;
  return input.now - input.failureAt.getTime() < CLASS_BOARD_PIN_FAILURE_WINDOW_MS;
}

export function nextPinFailure(input: { failures: number; failureAt: Date | null; now: Date }) {
  const expired = !input.failureAt || input.now.getTime() - input.failureAt.getTime() >= CLASS_BOARD_PIN_FAILURE_WINDOW_MS;
  if (expired) return { failures: 1, failureAt: input.now };
  return { failures: input.failures + 1, failureAt: input.failureAt };
}
