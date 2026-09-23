import type { EmailSignInCode } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ row: null as EmailSignInCode | null, allowed: true, sentCode: "" }));
const mail = vi.hoisted(() => vi.fn());
vi.mock("@/src/lib/prisma", () => {
  const table = {
    upsert: vi.fn(async ({ create }: { create: EmailSignInCode }) => db.row ??= { ...create }),
    update: vi.fn(async ({ data }: { data: Partial<EmailSignInCode> }) => (db.row = { ...db.row!, ...data }))
  };
  return { prisma: {
    $transaction: async (fn: (tx: { emailSignInCode: typeof table; $queryRaw: () => Promise<EmailSignInCode[]> }) => Promise<unknown>) => fn({ emailSignInCode: table, $queryRaw: async () => db.row ? [db.row] : [] }),
    user: { findFirst: async () => ({ id: "existing-user", email: "student@pausd.us", name: "Student", imageUrl: null }) }
  } };
});
vi.mock("@/src/lib/platform-admin", () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  isEmailAllowedToUsePlatform: async () => db.allowed
}));
vi.mock("@/src/lib/email", () => ({ isEmailNotificationsConfigured: () => true, sendSignInCodeEmail: mail }));
import { requestEmailSignInCode, verifyEmailSignInCode } from "@/src/server/email-sign-in";

beforeEach(() => {
  db.row = null;
  db.allowed = true;
  db.sentCode = "";
  vi.stubEnv("APP_AUTH_SECRET", "test-only-secret");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  mail.mockReset().mockImplementation(async (_email: string, code: string) => {
    db.sentCode = code;
    return { configured: true, sent: 1, failed: 0 };
  });
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const email = "student@pausd.us";
const browser = "browser-secret";
describe("email sign-in", () => {
  it("emails a six-digit code, stores only hashes, and signs into the existing user once", async () => {
    await requestEmailSignInCode(" Student@pausd.us ", browser);
    expect(db.sentCode).toMatch(/^\d{6}$/);
    expect(JSON.stringify(db.row)).not.toContain(db.sentCode);
    expect(JSON.stringify(db.row)).not.toContain(browser);
    const user = await verifyEmailSignInCode(email, db.sentCode, browser);
    expect(user).toMatchObject({ userId: "existing-user", provider: "email", name: "Student" });
    expect(await verifyEmailSignInCode(email, db.sentCode, browser)).toBeNull();
  });
  it("rejects wrong codes, another browser, and expired codes", async () => {
    await requestEmailSignInCode(email, browser);
    expect(await verifyEmailSignInCode(email, "abcdef", browser)).toBeNull();
    expect(await verifyEmailSignInCode(email, db.sentCode, "other-browser")).toBeNull();
    vi.advanceTimersByTime(10 * 60_000);
    expect(await verifyEmailSignInCode(email, db.sentCode, browser)).toBeNull();
  });
  it("locks a code after five wrong guesses", async () => {
    await requestEmailSignInCode(email, browser);
    const wrong = db.sentCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(await verifyEmailSignInCode(email, wrong, browser)).toBeNull();
    expect(await verifyEmailSignInCode(email, db.sentCode, browser)).toBeNull();
  });
  it("limits resends and invalidates the previous browser challenge", async () => {
    await requestEmailSignInCode(email, browser);
    await expect(requestEmailSignInCode(email, browser)).rejects.toThrow("TOO_MANY_REQUESTS");
    for (let i = 1; i < 5; i++) {
      vi.advanceTimersByTime(60_000);
      await requestEmailSignInCode(email, `browser-${i}`);
    }
    expect(await verifyEmailSignInCode(email, db.sentCode, browser)).toBeNull();
    vi.advanceTimersByTime(60_000);
    await expect(requestEmailSignInCode(email, browser)).rejects.toThrow("TOO_MANY_REQUESTS");
    vi.advanceTimersByTime(60 * 60_000);
    await expect(requestEmailSignInCode(email, browser)).resolves.toBeUndefined();
  });
  it("does not send codes or create challenges for unapproved emails", async () => {
    db.allowed = false;
    await requestEmailSignInCode(email, browser);
    expect(mail).not.toHaveBeenCalled();
    expect(db.row).toBeNull();
  });
  it("rechecks access after code verification", async () => {
    await requestEmailSignInCode(email, browser);
    db.allowed = false;
    expect(await verifyEmailSignInCode(email, db.sentCode, browser)).toBeNull();
  });
  it("reports mail delivery failure", async () => {
    mail.mockResolvedValue({ configured: true, sent: 0, failed: 1 });
    await expect(requestEmailSignInCode(email, browser)).rejects.toThrow("Could not send");
  });
});
