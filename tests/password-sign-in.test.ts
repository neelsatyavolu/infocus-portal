import type { EmailSignInCode } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Where = { attempts?: { lt?: number; gt?: number }; windowStartedAt?: Date };
type Data = { attempts?: number | { increment?: number; decrement?: number }; windowStartedAt?: Date };
const db = vi.hoisted(() => ({ row: null as EmailSignInCode | null, userExists: true }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  emailSignInCode: {
    upsert: vi.fn(async ({ create }: { create: EmailSignInCode }) => db.row ??= { ...create }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Data }) => {
      const row = db.row!;
      if (where.windowStartedAt && where.windowStartedAt.getTime() !== row.windowStartedAt.getTime()) return { count: 0 };
      if (where.attempts?.lt !== undefined && row.attempts >= where.attempts.lt) return { count: 0 };
      if (where.attempts?.gt !== undefined && row.attempts <= where.attempts.gt) return { count: 0 };
      const attempts = typeof data.attempts === "number"
        ? data.attempts
        : row.attempts + (data.attempts?.increment ?? 0) - (data.attempts?.decrement ?? 0);
      db.row = { ...row, attempts, windowStartedAt: data.windowStartedAt ?? row.windowStartedAt };
      return { count: 1 };
    })
  },
  user: { findFirst: async () => db.userExists ? { id: "existing-user", email: "superadmin@example.edu", name: "Sage", imageUrl: null } : null }
} }));
vi.mock("@/src/lib/platform-admin", () => ({ PLATFORM_SUPER_ADMIN_EMAIL: "superadmin@example.edu" }));
import { hashPassword, verifyPassword } from "@/src/lib/password-hash";
import { PASSWORD_SIGN_IN_MAX_ATTEMPTS, PASSWORD_SIGN_IN_WINDOW_MS, verifyPasswordSignIn } from "@/src/server/password-sign-in";

const password = "test-only-Passw0rd!?";
const start = new Date("2026-10-09T12:00:00Z");

beforeEach(async () => {
  db.row = null;
  db.userExists = true;
  vi.stubEnv("SUPER_ADMIN_PASSWORD_USERNAME", "sage");
  vi.stubEnv("SUPER_ADMIN_PASSWORD_HASH", await hashPassword(password));
});

afterEach(() => { vi.unstubAllEnvs(); });

describe("password hash", () => {
  it("salts each hash and verifies only the right password", async () => {
    const [first, second] = await Promise.all([hashPassword(password), hashPassword(password)]);
    expect(first).toMatch(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(`${password}x`, first)).toBe(false);
    expect(await verifyPassword(password, "not-a-hash")).toBe(false);
  });
});

describe("super admin password sign-in", () => {
  it("signs the right username and password into the existing super admin account", async () => {
    expect(await verifyPasswordSignIn(" Sage ", password, start)).toEqual({
      userId: "existing-user", email: "superadmin@example.edu", name: "Sage", imageUrl: null,
      provider: "email", providerUserId: "superadmin@example.edu"
    });
    expect(db.row?.attempts).toBe(0);
  });
  it("rejects a wrong password or username and counts the attempt", async () => {
    expect(await verifyPasswordSignIn("sage", "wrong-password", start)).toBeNull();
    expect(await verifyPasswordSignIn("otto", password, start)).toBeNull();
    expect(db.row?.attempts).toBe(2);
  });
  it("locks after too many wrong tries, even for the right password, until the window passes", async () => {
    for (let i = 0; i < PASSWORD_SIGN_IN_MAX_ATTEMPTS; i++) expect(await verifyPasswordSignIn("sage", "wrong-password", start)).toBeNull();
    await expect(verifyPasswordSignIn("sage", password, start)).rejects.toThrow("TOO_MANY_REQUESTS");
    const later = new Date(start.getTime() + PASSWORD_SIGN_IN_WINDOW_MS);
    expect(await verifyPasswordSignIn("sage", password, later)).toMatchObject({ userId: "existing-user" });
  });
  it.each([
    ["SUPER_ADMIN_PASSWORD_USERNAME", ""],
    ["SUPER_ADMIN_PASSWORD_HASH", ""],
    ["SUPER_ADMIN_PASSWORD_HASH", password]
  ])("is off without a valid %s and never touches the counter", async (name, value) => {
    vi.stubEnv(name, value);
    expect(await verifyPasswordSignIn("sage", password, start)).toBeNull();
    expect(db.row).toBeNull();
  });
  it("does not create an account when the super admin has none", async () => {
    db.userExists = false;
    expect(await verifyPasswordSignIn("sage", password, start)).toBeNull();
  });
});
