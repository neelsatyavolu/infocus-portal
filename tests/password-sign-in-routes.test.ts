import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const service = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/src/server/password-sign-in", () => ({ verifyPasswordSignIn: service.verify }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));
import { POST } from "@/app/api/auth/password/route";
import { APP_SESSION_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { parseAppSessionToken } from "@/src/lib/auth";
import middleware from "@/middleware";

const origin = "https://hub.infocuspaly.com";
const user = { userId: "existing-user", email: "superadmin@example.edu", name: "Sage", imageUrl: null, provider: "email" as const, providerUserId: "superadmin@example.edu" };
const credentials = { username: "sage", password: "test-only-Passw0rd!?" };
function request(body: unknown, requestOrigin = origin) {
  return new NextRequest(`${origin}/api/auth/password`, {
    method: "POST", headers: { origin: requestOrigin, host: "hub.infocuspaly.com", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_AUTH_SECRET", "test-only-secret");
  service.verify.mockResolvedValue(user);
});

afterEach(() => { vi.unstubAllEnvs(); });

describe("password sign-in route", () => {
  it("is reachable without a session", async () => {
    const response = await middleware(request({}));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
  it("rejects cross-origin requests before checking the password", async () => {
    expect((await POST(request(credentials, "https://other.test"))).status).toBe(403);
    expect(service.verify).not.toHaveBeenCalled();
  });
  it("validates inputs before checking the password", async () => {
    expect((await POST(request({ username: "sage" }))).status).toBe(400);
    expect((await POST(request({ username: "", password: "x" }))).status).toBe(400);
    expect((await POST(request({ username: "sage", password: "x".repeat(129) }))).status).toBe(400);
    expect(service.verify).not.toHaveBeenCalled();
  });
  it("gives one generic error for a wrong username or password and sets no session", async () => {
    service.verify.mockResolvedValueOnce(null);
    const response = await POST(request(credentials));
    expect(response.status).toBe(400);
    expect(response.cookies.get(APP_SESSION_COOKIE_NAME)).toBeUndefined();
  });
  it("reports the lockout and hides internal errors", async () => {
    service.verify.mockRejectedValueOnce(new Error("TOO_MANY_REQUESTS"));
    expect((await POST(request(credentials))).status).toBe(429);
    service.verify.mockRejectedValueOnce(new Error("private database detail"));
    expect(await (await POST(request(credentials))).text()).not.toContain("private database detail");
  });
  it("creates a shared session recognized by middleware", async () => {
    const response = await POST(request({ ...credentials, returnTo: "/groups?cycle=2" }));
    expect(service.verify).toHaveBeenCalledWith(credentials.username, credentials.password);
    expect(await response.json()).toEqual({ data: { returnTo: "/groups?cycle=2" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.cookies.get(APP_SESSION_COOKIE_NAME);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", domain: ".infocuspaly.com", path: "/" });
    expect(await parseAppSessionToken(cookie?.value)).toEqual(user);
  });
  it.each(["https://other.test", "//other.test", "/\\other.test", "/\t/other.test"])("prevents external redirects: %s", async (returnTo) => {
    const response = await POST(request({ ...credentials, returnTo }));
    expect(await response.json()).toEqual({ data: { returnTo: "/dashboard" } });
  });
});
