// Optional concurrency check against a disposable Postgres database:
// EMAIL_SIGN_IN_TEST_DATABASE_URL=... npx vitest run tests/email-sign-in-postgres.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

const state = vi.hoisted(() => ({ code: "" }));
vi.mock("@/src/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const url = process.env.EMAIL_SIGN_IN_TEST_DATABASE_URL;
  return { prisma: url ? new PrismaClient({ datasources: { db: { url } } }) : null };
});
vi.mock("@/src/lib/platform-admin", () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  isEmailAllowedToUsePlatform: async () => true
}));
vi.mock("@/src/lib/email", () => ({
  isEmailNotificationsConfigured: () => true,
  sendSignInCodeEmail: async (_email: string, code: string) => {
    state.code = code;
    return { configured: true, sent: 1, failed: 0 };
  }
}));
import { prisma } from "@/src/lib/prisma";
import { requestEmailSignInCode, verifyEmailSignInCode } from "@/src/server/email-sign-in";

const email = "concurrency@example.test";
const browser = "test-browser";
let createdTable = false;
describe.skipIf(!process.env.EMAIL_SIGN_IN_TEST_DATABASE_URL)("email sign-in Postgres concurrency", () => {
  beforeAll(async () => {
    vi.stubEnv("APP_AUTH_SECRET", "test-only-secret");
    const migration = await readFile("prisma/migrations/20260914_email_sign_in/migration.sql", "utf8");
    await prisma.$executeRawUnsafe(migration);
    createdTable = true;
    vi.spyOn(prisma.user, "findFirst").mockResolvedValue({ id: "existing", email, name: "Student", imageUrl: null } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
  });
  beforeEach(async () => { await prisma.emailSignInCode.deleteMany(); });
  afterAll(async () => {
    if (createdTable) await prisma.$executeRaw`DROP TABLE "EmailSignInCode"`;
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });
  it("allows only one concurrent first request", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => requestEmailSignInCode(email, browser)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected").every((result) => result.reason.message === "TOO_MANY_REQUESTS")).toBe(true);
  });
  it("allows exactly one concurrent redemption", async () => {
    await requestEmailSignInCode(email, browser);
    const results = await Promise.all(Array.from({ length: 10 }, () => verifyEmailSignInCode(email, state.code, browser)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("persists exactly five guesses under concurrent requests", async () => {
    await requestEmailSignInCode(email, browser);
    const wrong = state.code === "000000" ? "111111" : "000000";
    await Promise.all(Array.from({ length: 10 }, () => verifyEmailSignInCode(email, wrong, browser)));
    expect((await prisma.emailSignInCode.findUnique({ where: { email } }))?.attempts).toBe(5);
    expect(await verifyEmailSignInCode(email, state.code, browser)).toBeNull();
  });
});
