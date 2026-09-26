import { cookies } from "next/headers";
import { CLASS_BOARD_PIN_FAILURE_WINDOW_MS, CLASS_BOARD_PIN_MAX_FAILURES } from "@/src/lib/class-board-pin";
import {
  LIVESTREAM_PIN_COOKIE_NAME,
  createLivestreamPinToken,
  decryptLivestreamPin,
  encryptLivestreamPin,
  generateLivestreamPin,
  getLivestreamPinCookieMeta,
  hashLivestreamPin,
  isLivestreamPin,
  livestreamPinCookieMatches,
  livestreamPinHashesMatch
} from "@/src/lib/livestream-pin";
import { prisma } from "@/src/lib/prisma";
import { getProgramSettings } from "@/src/server/program-settings";

function authSecret() {
  const secret = process.env.APP_AUTH_SECRET?.trim() ?? "";
  if (!secret) throw new Error("Livestream PIN signing is unavailable.");
  return secret;
}

export async function currentLivestreamPin() {
  const settings = await getProgramSettings();
  if (!settings.livestreamPinCipher) return null;
  return decryptLivestreamPin(settings.livestreamPinCipher, authSecret());
}

/** Callers must check canManageLivestreams first. */
export async function issueLivestreamPin() {
  const pin = generateLivestreamPin();
  const settings = await getProgramSettings();
  await prisma.programSetting.update({
    where: { id: settings.id },
    data: {
      livestreamPinCipher: encryptLivestreamPin(pin, authSecret()),
      livestreamPinFailures: 0,
      livestreamPinFailureAt: null
    }
  });
  return pin;
}

export async function livestreamPinAllowsAccess(now = Date.now()) {
  const settings = await getProgramSettings();
  if (!settings.livestreamPinCipher) return false;
  let secret: string;
  try {
    secret = authSecret();
  } catch {
    return false;
  }
  const pin = decryptLivestreamPin(settings.livestreamPinCipher, secret);
  if (!pin) return false;
  const store = await cookies();
  return livestreamPinCookieMatches(store.get(LIVESTREAM_PIN_COOKIE_NAME)?.value, hashLivestreamPin(pin), secret, now);
}

/**
 * Checks a PIN. Each try first reserves one of the 20 attempts in the current 15-minute window
 * with a conditional database increment, so parallel guesses can't slip past the limit.
 * A correct PIN gives its attempt back.
 */
export async function unlockLivestreamDashboard(pin: string, now = new Date()) {
  if (!isLivestreamPin(pin)) throw new Error("BAD_REQUEST");
  const settings = await getProgramSettings();

  const windowStart = new Date(now.getTime() - CLASS_BOARD_PIN_FAILURE_WINDOW_MS);
  if (!settings.livestreamPinFailureAt || settings.livestreamPinFailureAt < windowStart) {
    // Only the request that saw the expired window starts a new one.
    await prisma.programSetting.updateMany({
      where: { id: settings.id, livestreamPinFailureAt: settings.livestreamPinFailureAt },
      data: { livestreamPinFailures: 0, livestreamPinFailureAt: now }
    });
  }

  const reserved = await prisma.programSetting.updateMany({
    where: { id: settings.id, livestreamPinFailures: { lt: CLASS_BOARD_PIN_MAX_FAILURES } },
    data: { livestreamPinFailures: { increment: 1 } }
  });
  if (reserved.count === 0) throw new Error("TOO_MANY_REQUESTS");

  const secret = authSecret();
  const current = settings.livestreamPinCipher ? decryptLivestreamPin(settings.livestreamPinCipher, secret) : null;
  const matches = Boolean(current && livestreamPinHashesMatch(hashLivestreamPin(current), hashLivestreamPin(pin)));
  if (!matches) throw new Error(current ? "FORBIDDEN" : "NOT_FOUND");

  await prisma.programSetting.updateMany({
    where: { id: settings.id, livestreamPinFailures: { gt: 0 } },
    data: { livestreamPinFailures: { decrement: 1 } }
  });
  return createLivestreamPinToken(hashLivestreamPin(current as string), secret, now.getTime());
}

export function livestreamPinCookieOptions() {
  return getLivestreamPinCookieMeta();
}
