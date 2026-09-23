import { cookies } from "next/headers";
import { getRealSessionUser } from "@/src/lib/auth";
import {
  CLASS_BOARD_PIN_COOKIE_NAME,
  classBoardPinCookieMatches,
  classBoardPinHashesMatch,
  createClassBoardPinToken,
  decryptClassBoardPin,
  encryptClassBoardPin,
  generateClassBoardPin,
  getClassBoardPinCookieMeta,
  hashClassBoardPin,
  isClassBoardPin,
  nextPinFailure,
  pinAttemptLocked
} from "@/src/lib/class-board-pin";
import { getPlatformRoleForEmail, isPlatformSuperAdmin } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getProgramSettings } from "@/src/server/program-settings";

function authSecret() {
  const secret = process.env.APP_AUTH_SECRET?.trim() ?? "";
  if (!secret) throw new Error("Class board PIN signing is unavailable.");
  return secret;
}

export async function requireClassBoardPinAdmin() {
  const real = await getRealSessionUser();
  if (!real?.email) throw new Error("UNAUTHORIZED");
  const role = await getPlatformRoleForEmail(real.email);
  if (!isPlatformSuperAdmin(role)) throw new Error("FORBIDDEN");
  return real;
}

export async function currentClassBoardPin() {
  const settings = await getProgramSettings();
  if (!settings.classBoardPinCipher) return null;
  return decryptClassBoardPin(settings.classBoardPinCipher, authSecret());
}

export async function issueClassBoardPin() {
  await requireClassBoardPinAdmin();
  const pin = generateClassBoardPin();
  const settings = await getProgramSettings();
  await prisma.programSetting.update({
    where: { id: settings.id },
    data: {
      classBoardPinCipher: encryptClassBoardPin(pin, authSecret()),
      classBoardPinFailures: 0,
      classBoardPinFailureAt: null
    }
  });
  return pin;
}

export async function classBoardPinAllowsAccess(now = Date.now()) {
  const settings = await getProgramSettings();
  if (!settings.classBoardPinCipher) return false;
  let secret: string;
  try {
    secret = authSecret();
  } catch {
    return false;
  }
  const pin = decryptClassBoardPin(settings.classBoardPinCipher, secret);
  if (!pin) return false;
  const store = await cookies();
  return classBoardPinCookieMatches(
    store.get(CLASS_BOARD_PIN_COOKIE_NAME)?.value,
    hashClassBoardPin(pin),
    secret,
    now
  );
}

export async function unlockClassBoard(pin: string, now = new Date()) {
  if (!isClassBoardPin(pin)) throw new Error("BAD_REQUEST");
  const settings = await getProgramSettings();
  if (
    pinAttemptLocked({
      failures: settings.classBoardPinFailures,
      failureAt: settings.classBoardPinFailureAt,
      now: now.getTime()
    })
  ) {
    throw new Error("TOO_MANY_REQUESTS");
  }

  const secret = authSecret();
  const current = settings.classBoardPinCipher
    ? decryptClassBoardPin(settings.classBoardPinCipher, secret)
    : null;
  const matches = Boolean(
    current && classBoardPinHashesMatch(hashClassBoardPin(current), hashClassBoardPin(pin))
  );

  if (!matches) {
    const next = nextPinFailure({
      failures: settings.classBoardPinFailures,
      failureAt: settings.classBoardPinFailureAt,
      now
    });
    await prisma.programSetting.update({
      where: { id: settings.id },
      data: { classBoardPinFailures: next.failures, classBoardPinFailureAt: next.failureAt }
    });
    throw new Error(current ? "FORBIDDEN" : "NOT_FOUND");
  }

  if (settings.classBoardPinFailures > 0) {
    await prisma.programSetting.update({
      where: { id: settings.id },
      data: { classBoardPinFailures: 0, classBoardPinFailureAt: null }
    });
  }

  return createClassBoardPinToken(hashClassBoardPin(current as string), secret, now.getTime());
}

export function classBoardPinCookieOptions() {
  return getClassBoardPinCookieMeta();
}
