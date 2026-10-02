import crypto from "node:crypto";
import type { SessionUser } from "@/src/lib/auth";
import { isEmailAllowedToUsePlatform } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

/**
 * Sign-in hand-off for the InFocus Mac app (PKCE, RFC 7636). The browser approves at
 * /app-sign-in, which issues a short code bound to the app's challenge; the app trades
 * code + verifier for a normal Portal session at /api/auth/app/token.
 */

export const APP_CODE_TTL_MS = 60 * 1000;
export const APP_CALLBACK_URL = "infocus://signed-in";
/** S256 challenge of a 32-byte verifier: 43 base64url characters. */
export const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
export const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
export const APP_STATE = /^[A-Za-z0-9_-]{16,128}$/;

type AppCodePayload = {
  typ: "app-code";
  v: 1;
  sub: string;
  prov: SessionUser["provider"];
  pid: string;
  ch: string;
  exp: number;
};

/** Its own key (derived from the session secret), so a code can never pass as a session or any other token. */
function codeKey() {
  const secret = process.env.APP_AUTH_SECRET;
  if (!secret) throw new Error("APP_AUTH_SECRET is required.");
  return crypto.createHmac("sha256", secret).update("infocus-mac-app-code/v1").digest();
}

function signCode(encodedPayload: string) {
  return crypto.createHmac("sha256", codeKey()).update(encodedPayload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function pkceChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function createAppSignInCode(user: SessionUser, challenge: string, nowMs = Date.now()) {
  if (!PKCE_CHALLENGE.test(challenge)) throw new Error("BAD_REQUEST");
  const payload: AppCodePayload = {
    typ: "app-code",
    v: 1,
    sub: user.userId,
    prov: user.provider,
    pid: user.providerUserId,
    ch: challenge,
    exp: nowMs + APP_CODE_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signCode(encoded)}`;
}

function readCode(code: string, nowMs: number): AppCodePayload | null {
  const [encoded, signature, extra] = code.split(".");
  if (!encoded || !signature || extra !== undefined || !safeEqual(signature, signCode(encoded))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<AppCodePayload>;
    if (
      payload.typ !== "app-code" ||
      payload.v !== 1 ||
      typeof payload.sub !== "string" ||
      typeof payload.pid !== "string" ||
      typeof payload.ch !== "string" ||
      (payload.prov !== "google" && payload.prov !== "email" && payload.prov !== "passkey") ||
      typeof payload.exp !== "number" ||
      payload.exp <= nowMs
    ) {
      return null;
    }
    return payload as AppCodePayload;
  } catch {
    return null;
  }
}

/**
 * Returns the session user for a valid code + verifier, or null. Throws FORBIDDEN when the
 * account was removed from Admin → People since the approval.
 */
export async function redeemAppSignInCode(code: string, verifier: string, nowMs = Date.now()): Promise<SessionUser | null> {
  if (!PKCE_VERIFIER.test(verifier)) return null;
  const payload = readCode(code, nowMs);
  if (!payload || !safeEqual(pkceChallenge(verifier), payload.ch)) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, imageUrl: true }
  });
  if (!user) return null;
  if (!(await isEmailAllowedToUsePlatform(user.email))) throw new Error("FORBIDDEN");

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    imageUrl: user.imageUrl,
    provider: payload.prov,
    providerUserId: payload.pid
  };
}

export function appCallbackUrl(params: Record<string, string>) {
  const url = new URL(APP_CALLBACK_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
