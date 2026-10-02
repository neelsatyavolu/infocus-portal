import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Admin → Reconnect YouTube: the channel refresh token is AES-256-GCM encrypted with a key
 * derived from APP_AUTH_SECRET (format v1.<iv>.<tag>.<data>, base64url), and the OAuth
 * `state` is an HMAC-signed { user, nonce, expiry } that must match a cookie nonce.
 */

const VERSION = "v1";
const AAD = Buffer.from(`youtube-credential.${VERSION}.channel`, "utf8");
export const YOUTUBE_CONNECT_STATE_TTL_MS = 10 * 60 * 1000;

function credentialKey(secret: string) {
  return createHash("sha256").update(`youtube-credential-key.${VERSION}.${secret}`).digest();
}

export function encryptRefreshToken(plain: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(secret), iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptRefreshToken(payload: string, secret: string) {
  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", credentialKey(secret), Buffer.from(ivPart, "base64url"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

type ConnectState = { userId: string; nonce: string; expiresAt: number };

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`youtube-connect.${VERSION}.${payload}`).digest("base64url");
}

/** A fresh `state` for Google's sign-in, plus the nonce the browser keeps in a cookie. */
export function createConnectState(userId: string, secret: string, now = Date.now()) {
  const nonce = randomBytes(16).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ userId, nonce, expiresAt: now + YOUTUBE_CONNECT_STATE_TTL_MS })).toString("base64url");
  return { state: `${payload}.${sign(payload, secret)}`, nonce };
}

/** The state Google sent back is ours, unexpired, for this person and this browser. */
export function verifyConnectState(
  state: string | null | undefined,
  input: { userId: string; cookieNonce: string | null | undefined; secret: string; now?: number }
) {
  const [payload, signature] = (state ?? "").split(".");
  if (!payload || !signature || !input.cookieNonce) return false;
  const expected = Buffer.from(sign(payload, input.secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  let parsed: ConnectState;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ConnectState;
  } catch {
    return false;
  }
  return (
    parsed.userId === input.userId &&
    parsed.nonce === input.cookieNonce &&
    typeof parsed.expiresAt === "number" &&
    parsed.expiresAt > (input.now ?? Date.now())
  );
}
