import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptVaultField, encryptVaultField, parseVaultKey } from "@/src/lib/vault-crypto";
import { generateTotp, parseTotpInput } from "@/src/lib/totp";

const key = randomBytes(32);

describe("vault field encryption", () => {
  it("round-trips a value for the same entry and field", () => {
    const cipher = encryptVaultField("hunter2 🔑", key, "entry-1", "password");
    expect(cipher).not.toContain("hunter2");
    expect(decryptVaultField(cipher, key, "entry-1", "password")).toBe("hunter2 🔑");
  });

  it("uses a fresh IV every time", () => {
    expect(encryptVaultField("same", key, "e", "password")).not.toBe(encryptVaultField("same", key, "e", "password"));
  });

  it("refuses ciphertext moved to another entry or field", () => {
    const cipher = encryptVaultField("secret", key, "entry-1", "password");
    expect(decryptVaultField(cipher, key, "entry-2", "password")).toBeNull();
    expect(decryptVaultField(cipher, key, "entry-1", "notes")).toBeNull();
  });

  it("refuses a wrong key or tampered data", () => {
    const cipher = encryptVaultField("secret", key, "entry-1", "password");
    expect(decryptVaultField(cipher, randomBytes(32), "entry-1", "password")).toBeNull();
    const parts = cipher.split(".");
    const tampered = [...parts.slice(0, 3), `${parts[3].slice(0, -2)}AA`].join(".");
    expect(decryptVaultField(tampered, key, "entry-1", "password")).toBeNull();
    expect(decryptVaultField("garbage", key, "entry-1", "password")).toBeNull();
  });

  it("only accepts a 32-byte base64 key", () => {
    expect(parseVaultKey(key.toString("base64"))?.equals(key)).toBe(true);
    expect(parseVaultKey(randomBytes(16).toString("base64"))).toBeNull();
    expect(parseVaultKey("")).toBeNull();
    expect(parseVaultKey(undefined)).toBeNull();
  });
});

describe("TOTP", () => {
  // RFC 6238 Appendix B test vectors.
  const sha1Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const sha256Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA";

  it("matches RFC 6238 SHA1 vectors", () => {
    const config = { secret: sha1Secret, digits: 8, period: 30, algorithm: "SHA1" as const };
    expect(generateTotp(config, 59_000).code).toBe("94287082");
    expect(generateTotp(config, 1_111_111_109_000).code).toBe("07081804");
    expect(generateTotp(config, 20_000_000_000_000).code).toBe("65353130");
  });

  it("matches RFC 6238 SHA256 vector", () => {
    const config = { secret: sha256Secret, digits: 8, period: 30, algorithm: "SHA256" as const };
    expect(generateTotp(config, 59_000).code).toBe("46119246");
  });

  it("reports seconds left in the window", () => {
    const config = { secret: sha1Secret, digits: 6, period: 30, algorithm: "SHA1" as const };
    expect(generateTotp(config, 59_000).secondsRemaining).toBe(1);
    expect(generateTotp(config, 60_000).secondsRemaining).toBe(30);
  });

  it("parses a spaced lowercase setup key", () => {
    expect(parseTotpInput("gezd gnbv gy3t qojq gezd gnbv gy3t qojq")).toEqual({
      secret: sha1Secret,
      digits: 6,
      period: 30,
      algorithm: "SHA1"
    });
  });

  it("parses an otpauth URI", () => {
    expect(
      parseTotpInput(`otpauth://totp/InFocus:news@example.com?secret=${sha1Secret}&issuer=InFocus&digits=8&period=60&algorithm=sha256`)
    ).toEqual({ secret: sha1Secret, digits: 8, period: 60, algorithm: "SHA256" });
  });

  it("rejects bad input", () => {
    expect(parseTotpInput("")).toBeNull();
    expect(parseTotpInput("not base32!!")).toBeNull();
    expect(parseTotpInput("ABCD")).toBeNull();
    expect(parseTotpInput(`otpauth://hotp/x?secret=${sha1Secret}`)).toBeNull();
    expect(parseTotpInput(`otpauth://totp/x?secret=${sha1Secret}&digits=4`)).toBeNull();
    expect(parseTotpInput(`otpauth://totp/x?secret=${sha1Secret}&algorithm=MD5`)).toBeNull();
  });
});
