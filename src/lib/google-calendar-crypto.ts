import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Admin → Connect Google Calendar: the refresh token is AES-256-GCM encrypted with a key derived
 * from APP_AUTH_SECRET (format v1.<iv>.<tag>.<data>, base64url). Same scheme as the YouTube
 * credential, with its own derivation label and AAD so neither can open the other.
 */

const VERSION = "v1";
const AAD = Buffer.from(`google-calendar-credential.${VERSION}.account`, "utf8");

function credentialKey(secret: string) {
  return createHash("sha256").update(`google-calendar-credential-key.${VERSION}.${secret}`).digest();
}

export function encryptCalendarToken(plain: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(secret), iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptCalendarToken(payload: string, secret: string) {
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
