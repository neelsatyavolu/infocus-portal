import { TELEPROMPTER_KIOSK_COOKIE_NAME } from "@/src/lib/auth-cookies";

export { TELEPROMPTER_KIOSK_COOKIE_NAME };

export const TELEPROMPTER_KIOSK_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const TELEPROMPTER_KIOSK_USER_ID = "kiosk-teleprompter";

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

export function getTeleprompterKioskToken() {
  return process.env.TELEPROMPTER_KIOSK_TOKEN?.trim() || "";
}

export function isValidTeleprompterKioskToken(value?: string | null) {
  const expected = getTeleprompterKioskToken();
  if (!expected || !value) {
    return false;
  }

  return timingSafeEqual(value, expected);
}

export function isTeleprompterKioskPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "" ||
    pathname.startsWith("/teleprompter") ||
    pathname.startsWith("/api/teleprompter")
  );
}

export function getTeleprompterKioskCookieMeta() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    path: "/",
    maxAge: TELEPROMPTER_KIOSK_COOKIE_MAX_AGE_SECONDS
  };
}
