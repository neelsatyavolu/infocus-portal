import { createHmac, timingSafeEqual } from "node:crypto";
import { EQUIPMENT_STATION_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { PORTAL_DOMAINS, portalDomainOf, resolveSessionCookieDomain } from "@/src/lib/hosts";
export { EQUIPMENT_STATION_COOKIE_NAME };
export const EQUIPMENT_SESSION_SECONDS = 3600;
export const EQUIPMENT_OAUTH_COOKIE_NAME = "infocus_equipment_google_oauth";

type StationSession = { userId: string; expiresAt: number };
function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update("equipment-checkout.v2." + payload).digest("base64url");
}
export function createStationToken(userId: string) {
  const secret = process.env.APP_AUTH_SECRET;
  if (!secret || !userId) throw new Error("Equipment session signing is unavailable.");
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + EQUIPMENT_SESSION_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}
export function parseStationToken(token?: string | null): StationSession | null {
  const secret = process.env.APP_AUTH_SECRET;
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = Buffer.from(signature(parts[0], secret));
  const supplied = Buffer.from(parts[1]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (typeof value.userId !== "string" || !value.userId || typeof value.expiresAt !== "number" ||
        value.expiresAt <= Date.now() || value.expiresAt > Date.now() + EQUIPMENT_SESSION_SECONDS * 1000) return null;
    return { userId: value.userId, expiresAt: value.expiresAt };
  } catch { return null; }
}
export function getEquipmentStationCookieMeta(host?: string | null) {
  const domain = resolveSessionCookieDomain(host);
  return {
    httpOnly: true, sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    path: "/", maxAge: EQUIPMENT_SESSION_SECONDS,
    ...(domain ? { domain } : {})
  };
}

/** Where equipment sign-in and passkeys run: the equipment host, main host and www of each Portal domain. */
export const EQUIPMENT_PORTAL_ORIGINS = PORTAL_DOMAINS.flatMap((domain) =>
  ["equipment.", "", "www."].map((prefix) => `https://${prefix}${domain}`)
);

/**
 * Passkeys were registered on infocuspaly.com, so every Portal domain keeps that RP ID; the other
 * domain is allowed to use it by /.well-known/webauthn on infocuspaly.com (worker.ts).
 */
export const PASSKEY_RP_ID = "infocuspaly.com";

/** The origins infocuspaly.com's /.well-known/webauthn lets use its passkeys. */
export function passkeyRelatedOrigins() {
  return EQUIPMENT_PORTAL_ORIGINS.filter((origin) => portalDomainOf(new URL(origin).hostname) !== PASSKEY_RP_ID);
}

export function isEquipmentSignInOrigin(origin: string) {
  if (EQUIPMENT_PORTAL_ORIGINS.includes(origin)) return true;
  try { return process.env.NODE_ENV !== "production" && new URL(origin).hostname === "localhost"; }
  catch { return false; }
}
