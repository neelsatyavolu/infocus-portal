import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";

const service = vi.hoisted(() => ({ request: vi.fn(), verify: vi.fn() }));
vi.mock("@/src/server/email-sign-in", () => ({
  EMAIL_CODE_TTL_SECONDS: 600, EMAIL_SIGN_IN_COOKIE: "infocus_email_sign_in",
  requestEmailSignInCode: service.request, verifyEmailSignInCode: service.verify
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));
import { POST as requestCode } from "@/app/api/auth/email/request/route";
import { POST as verifyCode } from "@/app/api/auth/email/verify/route";
import { APP_SESSION_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { createAppSessionToken, parseAppSessionToken } from "@/src/lib/auth";
import middleware from "@/middleware";

const origin = "https://hub.infocuspaly.com";
const user = { userId: "existing-user", email: "student@pausd.us", name: "Student", imageUrl: null, provider: "email" as const, providerUserId: "student@pausd.us" };
function request(action: string, body: unknown, requestOrigin = origin, cookie = "infocus_email_sign_in=browser-token") {
  return new NextRequest(`${origin}/api/auth/email/${action}`, {
    method: "POST", headers: { origin: requestOrigin, host: "hub.infocuspaly.com", "content-type": "application/json", cookie },
    body: JSON.stringify(body)
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_AUTH_SECRET", "test-only-secret");
  service.request.mockResolvedValue(undefined);
  service.verify.mockResolvedValue(user);
});

afterEach(() => { vi.unstubAllEnvs(); });

describe("email sign-in routes", () => {
  it("keeps both endpoints reachable without a session", async () => {
    for (const action of ["request", "verify"]) {
      const response = await middleware(request(action, {}));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
  });
  it("rejects cross-origin requests before sending mail or signing in", async () => {
    expect((await requestCode(request("request", { email: user.email }, "https://other.test"))).status).toBe(403);
    expect((await verifyCode(request("verify", { email: user.email, code: "123456" }, "https://other.test"))).status).toBe(403);
    expect(service.request).not.toHaveBeenCalled();
    expect(service.verify).not.toHaveBeenCalled();
  });
  it("validates email and code inputs", async () => {
    expect((await requestCode(request("request", { email: "bad" }))).status).toBe(400);
    expect((await verifyCode(request("verify", { email: user.email, code: "123" }))).status).toBe(400);
    expect(service.request).not.toHaveBeenCalled();
    expect(service.verify).not.toHaveBeenCalled();
  });
  it("returns only a generic response and sets an HTTP-only browser challenge", async () => {
    const response = await requestCode(request("request", { email: user.email }));
    expect(await response.json()).toEqual({ data: { sent: true } });
    expect(response.cookies.get("infocus_email_sign_in")).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/api/auth/email", maxAge: 600 });
    expect(response.cookies.get("infocus_email_sign_in")?.value).toMatch(/^[a-f0-9]{64}$/);
  });
  it("reports throttling and hides internal errors", async () => {
    service.request.mockRejectedValueOnce(new Error("TOO_MANY_REQUESTS"));
    expect((await requestCode(request("request", { email: user.email }))).status).toBe(429);
    service.request.mockRejectedValueOnce(new Error("private database detail"));
    const response = await requestCode(request("request", { email: user.email }));
    expect(await response.text()).not.toContain("private database detail");
  });
  it("requires a browser challenge and a valid code before setting a session", async () => {
    const missing = await verifyCode(request("verify", { email: user.email, code: "123456" }, origin, ""));
    expect(missing.status).toBe(400);
    expect(service.verify).not.toHaveBeenCalled();
    service.verify.mockResolvedValueOnce(null);
    const invalid = await verifyCode(request("verify", { email: user.email, code: "123456" }));
    expect(invalid.status).toBe(400);
    expect(invalid.cookies.get(APP_SESSION_COOKIE_NAME)).toBeUndefined();
  });
  it("creates a shared session recognized by middleware and clears the challenge", async () => {
    const response = await verifyCode(request("verify", { email: user.email, code: "123456", returnTo: "/groups?cycle=2" }));
    expect(await response.json()).toEqual({ data: { returnTo: "/groups?cycle=2" } });
    const cookie = response.cookies.get(APP_SESSION_COOKIE_NAME);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", domain: ".infocuspaly.com", path: "/" });
    expect(await parseAppSessionToken(cookie?.value)).toEqual(user);
    expect(response.cookies.get("infocus_email_sign_in")?.maxAge).toBe(0);
  });
  it.each(["https://other.test", "//other.test", "/\\other.test", "/\t/other.test"])("prevents external redirects: %s", async (returnTo) => {
    const response = await verifyCode(request("verify", { email: user.email, code: "123456", returnTo }));
    expect(await response.json()).toEqual({ data: { returnTo: "/dashboard" } });
  });
});

describe("session provider compatibility", () => {
  it("accepts passkey sessions", async () => {
    const passkeyUser = { ...user, provider: "passkey" as const };
    expect(await parseAppSessionToken(createAppSessionToken(passkeyUser, false))).toEqual(passkeyUser);
  });
  it("continues to accept Google sessions", async () => {
    const googleUser = { ...user, provider: "google" as const };
    expect(await parseAppSessionToken(createAppSessionToken(googleUser, true))).toEqual(googleUser);
  });
  it("rejects tampered sessions and unknown providers", async () => {
    expect(await parseAppSessionToken(createAppSessionToken(user, true) + "x")).toBeNull();
    const encoded = Buffer.from(JSON.stringify({ ...user, provider: "unknown", v: 1, iat: Date.now(), exp: Date.now() + 60000 })).toString("base64url");
    const signature = createHmac("sha256", process.env.APP_AUTH_SECRET!).update(encoded).digest("base64url");
    expect(await parseAppSessionToken(`${encoded}.${signature}`)).toBeNull();
  });
});
