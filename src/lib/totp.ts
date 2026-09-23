import { createHmac } from "node:crypto";

/** RFC 6238 TOTP for vault 2FA codes. */
export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export type TotpConfig = {
  secret: string;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
};

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ALGORITHMS: readonly TotpAlgorithm[] = ["SHA1", "SHA256", "SHA512"];

export function decodeBase32(input: string) {
  const clean = input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function normalizeSecret(raw: string) {
  const clean = raw.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  const decoded = decodeBase32(clean);
  return decoded && decoded.length >= 10 ? clean : null;
}

/**
 * Accepts a base32 setup key or an otpauth://totp/ URI (from a QR code).
 * Returns null when the input is not a usable TOTP secret.
 */
export function parseTotpInput(input: string): TotpConfig | null {
  const value = input.trim();
  if (!value) return null;

  if (!value.toLowerCase().startsWith("otpauth://")) {
    const secret = normalizeSecret(value);
    return secret ? { secret, digits: 6, period: 30, algorithm: "SHA1" } : null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.host.toLowerCase() !== "totp") return null;

  const secret = normalizeSecret(url.searchParams.get("secret") ?? "");
  const digits = Number(url.searchParams.get("digits") ?? 6);
  const period = Number(url.searchParams.get("period") ?? 30);
  const algorithm = (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase() as TotpAlgorithm;

  if (!secret || !ALGORITHMS.includes(algorithm)) return null;
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) return null;
  if (!Number.isInteger(period) || period < 15 || period > 120) return null;

  return { secret, digits, period, algorithm };
}

export function generateTotp(config: TotpConfig, now = Date.now()) {
  const key = decodeBase32(config.secret);
  if (!key) throw new Error("Invalid TOTP secret.");

  const counter = Math.floor(now / 1000 / config.period);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac(config.algorithm.toLowerCase(), key).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  const code = String(binary % 10 ** config.digits).padStart(config.digits, "0");
  const secondsRemaining = config.period - (Math.floor(now / 1000) % config.period);

  return { code, secondsRemaining, period: config.period };
}
