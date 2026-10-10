import type { SessionUser } from "@/src/lib/auth-edge";
import { prisma } from "@/src/lib/prisma";
import { PLATFORM_SUPER_ADMIN_EMAIL } from "@/src/lib/platform-admin";
import { isPasswordHash, verifyPassword } from "@/src/lib/password-hash";

export const PASSWORD_SIGN_IN_MAX_ATTEMPTS = 10;
export const PASSWORD_SIGN_IN_WINDOW_MS = 15 * 60_000;
// The attempt counter is one EmailSignInCode row under this key. It has no "@", so it can never be someone's address.
const ATTEMPTS_KEY = "super-admin-password";

/**
 * Password sign-in exists for one person, the super admin. Env only, never in source:
 * SUPER_ADMIN_PASSWORD_USERNAME and SUPER_ADMIN_PASSWORD_HASH (`npx tsx scripts/hash-password.ts`).
 * Without both, or without PLATFORM_SUPER_ADMIN_EMAIL, nobody can sign in this way.
 */
function passwordSignInConfig() {
  const username = process.env.SUPER_ADMIN_PASSWORD_USERNAME?.trim().toLowerCase();
  const passwordHash = process.env.SUPER_ADMIN_PASSWORD_HASH?.trim() ?? "";
  if (!username || !isPasswordHash(passwordHash) || !PLATFORM_SUPER_ADMIN_EMAIL) return null;
  return { username, passwordHash, email: PLATFORM_SUPER_ADMIN_EMAIL };
}

/**
 * Reserves one of the 10 tries in the current 15-minute window with a conditional database
 * increment, so parallel guesses can't slip past the limit (same scheme as the livestream PIN).
 */
async function reserveAttempt(now: Date) {
  const counter = await prisma.emailSignInCode.upsert({
    where: { email: ATTEMPTS_KEY },
    create: {
      email: ATTEMPTS_KEY, codeHash: "", browserHash: "", expiresAt: now, sentAt: now,
      attempts: 0, windowStartedAt: now, sendCount: 0
    },
    update: {}
  });
  if (now.getTime() - counter.windowStartedAt.getTime() >= PASSWORD_SIGN_IN_WINDOW_MS) {
    // Only the request that saw the expired window starts a new one.
    await prisma.emailSignInCode.updateMany({
      where: { email: ATTEMPTS_KEY, windowStartedAt: counter.windowStartedAt },
      data: { attempts: 0, windowStartedAt: now }
    });
  }
  const reserved = await prisma.emailSignInCode.updateMany({
    where: { email: ATTEMPTS_KEY, attempts: { lt: PASSWORD_SIGN_IN_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } }
  });
  if (reserved.count === 0) throw new Error("TOO_MANY_REQUESTS");
}

/** Signs into the super admin's existing account. A correct sign-in gives its attempt back. */
export async function verifyPasswordSignIn(username: string, password: string, now = new Date()): Promise<SessionUser | null> {
  const config = passwordSignInConfig();
  if (!config) return null;
  await reserveAttempt(now);

  // Hash before comparing the username so both mistakes cost the same time.
  const passwordMatches = await verifyPassword(password, config.passwordHash);
  if (!passwordMatches || username.trim().toLowerCase() !== config.username) return null;

  const user = await prisma.user.findFirst({ where: { email: config.email }, orderBy: { createdAt: "asc" } });
  if (!user) return null;
  await prisma.emailSignInCode.updateMany({
    where: { email: ATTEMPTS_KEY, attempts: { gt: 0 } },
    data: { attempts: { decrement: 1 } }
  });
  return {
    userId: user.id, email: user.email, name: user.name, imageUrl: user.imageUrl,
    provider: "email", providerUserId: config.email
  };
}
