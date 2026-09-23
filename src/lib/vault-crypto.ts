import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Password vault field encryption: AES-256-GCM with a dedicated 32-byte key
 * (PASSWORD_VAULT_KEY, base64). Each field is bound to its entry id and field
 * name via AAD, so a ciphertext cannot be moved to another entry or field.
 * Format: v1.<iv>.<tag>.<data> (base64url).
 */
const VERSION = "v1";
const KEY_BYTES = 32;

export type VaultField = "username" | "password" | "totp" | "notes";

export function parseVaultKey(raw: string | null | undefined) {
  const value = raw?.trim();
  if (!value) return null;
  const key = Buffer.from(value, "base64");
  return key.length === KEY_BYTES ? key : null;
}

function aad(entryId: string, field: VaultField) {
  return Buffer.from(`password-vault.${VERSION}.${entryId}.${field}`, "utf8");
}

export function encryptVaultField(plain: string, key: Buffer, entryId: string, field: VaultField) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(entryId, field));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(
    "."
  );
}

export function decryptVaultField(payload: string, key: Buffer, entryId: string, field: VaultField) {
  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== VERSION || !ivPart || !tagPart || dataPart === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAAD(aad(entryId, field));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
