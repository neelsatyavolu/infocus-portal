import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Meeting E2EE key at rest: 32 random bytes, AES-256-GCM sealed with a key derived from
 * APP_AUTH_SECRET (format v1.<iv>.<tag>.<data>, base64url). Mirrors youtube-credential-crypto
 * with its own derivation label and AAD so the two can never open each other's values.
 */

const VERSION = "v1";
const AAD = Buffer.from(`meeting-key.${VERSION}.room`, "utf8");
export const MEETING_KEY_BYTES = 32;

function wrappingKey(secret: string) {
  return createHash("sha256").update(`meeting-key-wrap.${VERSION}.${secret}`).digest();
}

export function createMeetingKey() {
  return randomBytes(MEETING_KEY_BYTES);
}

export function meetingKeyToBase64Url(key: Buffer) {
  return key.toString("base64url");
}

export function sealMeetingKey(key: Buffer, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", wrappingKey(secret), iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(key), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** The 32-byte key, or null when the value is malformed, tampered with, or sealed with another secret. */
export function openMeetingKey(payload: string, secret: string) {
  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", wrappingKey(secret), Buffer.from(ivPart, "base64url"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const key = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]);
    return key.length === MEETING_KEY_BYTES ? key : null;
  } catch {
    return null;
  }
}
