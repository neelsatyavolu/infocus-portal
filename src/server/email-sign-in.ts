import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { EmailSignInCode } from "@prisma/client";
import type { SessionUser } from "@/src/lib/auth-edge";
import { prisma } from "@/src/lib/prisma";
import { isEmailAllowedToUsePlatform, normalizeEmail } from "@/src/lib/platform-admin";
import { isEmailNotificationsConfigured, sendSignInCodeEmail } from "@/src/lib/email";

export const EMAIL_SIGN_IN_COOKIE = "infocus_email_sign_in";
export const EMAIL_CODE_TTL_SECONDS = 10 * 60;

function hash(value: string) {
  const secret = process.env.APP_AUTH_SECRET;
  if (!secret) throw new Error("Email sign-in is not configured.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function requestEmailSignInCode(inputEmail: string, browserToken: string) {
  if (!process.env.APP_AUTH_SECRET || !isEmailNotificationsConfigured()) {
    throw new Error("Email sign-in is not configured.");
  }
  const email = normalizeEmail(inputEmail);
  // Give the same success response for unknown addresses without sending mail.
  if (!(await isEmailAllowedToUsePlatform(email))) return;

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Updating the key locks this email's row until commit, including concurrent resends.
    const existing = await tx.emailSignInCode.upsert({
      where: { email },
      create: {
        email, codeHash: "", browserHash: "", expiresAt: now, sentAt: new Date(0),
        attempts: 0, windowStartedAt: now, sendCount: 0
      },
      update: { email }
    });
    const newWindow = now.getTime() - existing.windowStartedAt.getTime() >= 60 * 60_000;
    if (now.getTime() - existing.sentAt.getTime() < 60_000 || (!newWindow && existing.sendCount >= 5)) {
      throw new Error("TOO_MANY_REQUESTS");
    }
    await tx.emailSignInCode.update({
      where: { email },
      data: {
        codeHash: hash(`code:${email}:${browserToken}:${code}`),
        browserHash: hash(`browser:${browserToken}`),
        expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_SECONDS * 1000),
        sentAt: now, attempts: 0,
        windowStartedAt: newWindow ? now : existing.windowStartedAt,
        sendCount: newWindow ? 1 : existing.sendCount + 1
      }
    });
  });

  const result = await sendSignInCodeEmail(email, code);
  if (!result.configured || result.sent !== 1) {
    throw new Error("Could not send your code. Please wait a minute and try again.");
  }
}

export async function verifyEmailSignInCode(inputEmail: string, code: string, browserToken: string): Promise<SessionUser | null> {
  const email = normalizeEmail(inputEmail);
  if (!/^\d{6}$/.test(code) || !browserToken) return null;
  const verified = await prisma.$transaction(async (tx) => {
    const [challenge] = await tx.$queryRaw<EmailSignInCode[]>`
      SELECT * FROM "EmailSignInCode" WHERE "email" = ${email} FOR UPDATE
    `;
    if (!challenge || challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= 5 ||
        challenge.browserHash !== hash(`browser:${browserToken}`) || !challenge.codeHash) return false;

    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(hash(`code:${email}:${browserToken}:${code}`), "hex");
    const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
    // Persist wrong guesses; consume successful codes under the same row lock.
    await tx.emailSignInCode.update({
      where: { email },
      data: { attempts: challenge.attempts + 1, ...(matches ? { codeHash: "", browserHash: "" } : {}) }
    });
    return matches;
  });
  if (!verified || !(await isEmailAllowedToUsePlatform(email))) return null;

  const existing = await prisma.user.findFirst({ where: { email }, orderBy: { createdAt: "asc" } });
  // Match Google's provisioning behavior for hardcoded admins and legacy allowlisted accounts.
  const user = existing ?? await prisma.user.upsert({
    where: { id: `email_${email}` },
    create: { id: `email_${email}`, email },
    update: {}
  });
  return {
    userId: user.id, email: user.email, name: user.name, imageUrl: user.imageUrl,
    provider: "email", providerUserId: email
  };
}
