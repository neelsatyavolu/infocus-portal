import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ findUser: vi.fn(), allowed: vi.fn(), real: vi.fn(), session: vi.fn() }));

vi.mock("@/src/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock("@/src/lib/platform-admin", async (original) => ({
  ...(await original<typeof import("@/src/lib/platform-admin")>()),
  isEmailAllowedToUsePlatform: mocks.allowed
}));
vi.mock("@/src/lib/auth", async (original) => ({
  ...(await original<typeof import("@/src/lib/auth")>()),
  getRealSessionUser: mocks.real,
  getSessionUser: mocks.session
}));

import { parseAppSessionToken, type SessionUser } from "@/src/lib/auth";
import { createAppSignInCode, pkceChallenge, redeemAppSignInCode } from "@/src/server/app-sign-in";
import { POST as authorize } from "@/app/api/auth/app/authorize/route";
import { POST as exchange } from "@/app/api/auth/app/token/route";
import middleware from "@/middleware";

const origin = "https://hub.infocuspaly.com";
// RFC 7636 Appendix B.
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const state = "abcdefghijklmnop";
const user: SessionUser = {
  userId: "user-1",
  email: "sage@example.edu",
  name: "Sage",
  imageUrl: null,
  provider: "google",
  providerUserId: "g-1"
};

function authorizeRequest(fields: Record<string, string>, requestOrigin = origin) {
  return new NextRequest(`${origin}/api/auth/app/authorize`, {
    method: "POST",
    headers: { origin: requestOrigin, host: "hub.infocuspaly.com" },
    body: new URLSearchParams(fields)
  });
}

function tokenRequest(body: unknown) {
  return new NextRequest(`${origin}/api/auth/app/token`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "hub.infocuspaly.com" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_AUTH_SECRET", "test-only-secret");
  mocks.findUser.mockResolvedValue({ id: "user-1", email: "sage@example.edu", name: "Sage", imageUrl: null });
  mocks.allowed.mockResolvedValue(true);
  mocks.real.mockResolvedValue(user);
  mocks.session.mockResolvedValue(user);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("app sign-in codes", () => {
  it("uses S256 PKCE", () => {
    expect(pkceChallenge(verifier)).toBe(challenge);
  });

  it("redeem with the right verifier gives the original session user", async () => {
    const code = createAppSignInCode(user, challenge);
    expect(await redeemAppSignInCode(code, verifier)).toEqual(user);
  });

  it("rejects a wrong verifier, an expired code, or a tampered code", async () => {
    const now = Date.now();
    const code = createAppSignInCode(user, challenge, now);
    expect(await redeemAppSignInCode(code, "x".repeat(43), now)).toBeNull();
    expect(await redeemAppSignInCode(code, verifier, now + 61_000)).toBeNull();
    const [payload, signature] = code.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), sub: "admin" })).toString("base64url");
    expect(await redeemAppSignInCode(`${forged}.${signature}`, verifier, now)).toBeNull();
  });

  it("can never be used as a session cookie", async () => {
    const code = createAppSignInCode(user, challenge);
    expect(await parseAppSessionToken(code)).toBeNull();
  });

  it("refuses accounts removed from Admin → People since approval", async () => {
    mocks.allowed.mockResolvedValue(false);
    await expect(redeemAppSignInCode(createAppSignInCode(user, challenge), verifier)).rejects.toThrow("FORBIDDEN");
    mocks.findUser.mockResolvedValue(null);
    expect(await redeemAppSignInCode(createAppSignInCode(user, challenge), verifier)).toBeNull();
  });
});

describe("POST /api/auth/app/authorize", () => {
  it("hands a code and the state back to the app on Allow", async () => {
    const response = await authorize(authorizeRequest({ challenge, state, decision: "allow" }));
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(`${location.protocol}//${location.host}`).toBe("infocus://signed-in");
    expect(location.searchParams.get("state")).toBe(state);
    expect(await redeemAppSignInCode(location.searchParams.get("code")!, verifier)).toEqual(user);
  });

  it("reports Cancel to the app without a code", async () => {
    const response = await authorize(authorizeRequest({ challenge, state, decision: "cancel" }));
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("cancelled");
    expect(location.searchParams.get("code")).toBeNull();
  });

  it("blocks cross-site posts, bad links, signed-out users and View as", async () => {
    expect((await authorize(authorizeRequest({ challenge, state, decision: "allow" }, "https://evil.test"))).status).toBe(403);
    expect((await authorize(authorizeRequest({ challenge: "short", state, decision: "allow" }))).status).toBe(400);
    mocks.real.mockResolvedValueOnce(null);
    expect((await authorize(authorizeRequest({ challenge, state, decision: "allow" }))).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ ...user, userId: "viewed-student" });
    expect((await authorize(authorizeRequest({ challenge, state, decision: "allow" }))).status).toBe(403);
  });
});

describe("POST /api/auth/app/token", () => {
  it("returns a 30-day Portal session the app stores as the session cookie", async () => {
    const code = createAppSignInCode(user, challenge);
    const response = await exchange(tokenRequest({ code, verifier }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const { data } = await response.json();
    expect(data.cookie).toMatchObject({ name: "infocus_session", path: "/" });
    expect(data.maxAgeSeconds).toBe(30 * 24 * 60 * 60);
    expect(await parseAppSessionToken(data.token)).toEqual(user);
  });

  it("fails cleanly for bad input, expired codes and removed accounts", async () => {
    expect((await exchange(tokenRequest({ code: "x" }))).status).toBe(400);
    expect((await exchange(tokenRequest({ code: createAppSignInCode(user, challenge), verifier: "y".repeat(43) }))).status).toBe(400);
    mocks.allowed.mockResolvedValue(false);
    expect((await exchange(tokenRequest({ code: createAppSignInCode(user, challenge), verifier }))).status).toBe(403);
  });
});

describe("middleware", () => {
  it("leaves only the token exchange public", async () => {
    const token = await middleware(tokenRequest({}));
    expect(token.headers.get("location")).toBeNull();

    const page = await middleware(new NextRequest(`${origin}/app-sign-in?challenge=${challenge}&state=${state}`, { headers: { host: "hub.infocuspaly.com" } }));
    const signIn = new URL(page.headers.get("location")!);
    expect(signIn.pathname).toBe("/sign-in");
    expect(signIn.searchParams.get("returnTo")).toBe(`/app-sign-in?challenge=${challenge}&state=${state}`);

    const approve = await middleware(authorizeRequest({ challenge, state, decision: "allow" }));
    expect(approve.status).toBe(401);
  });
});
