import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateGuestToken() {
  return randomBytes(24).toString("base64url");
}

export function hashPasscode(passcode: string) {
  return createHash("sha256").update(passcode).digest("hex");
}

export function verifyPasscode(passcode: string, hash: string) {
  const candidate = hashPasscode(passcode);
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

export function isGuestLinkActive(link: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}) {
  if (link.revokedAt) {
    return false;
  }

  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return false;
  }

  return true;
}
