import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/src/lib/prisma", () => ({ prisma: {}, withoutAppReviewUser: <T,>(args: T) => args }));

import { appReviewCode, isAppReviewEmail, isAppReviewPathAllowed } from "@/src/lib/app-review";
import { createAppSessionToken } from "@/src/lib/auth";
import { APP_SESSION_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { buildWorkspaceAccessWhere } from "@/src/server/workspace-access";
import middleware from "@/middleware";

const REVIEW_EMAIL = "review@example.edu";
const origin = "https://portal.example.edu";

beforeEach(() => {
  vi.stubEnv("APP_AUTH_SECRET", "test-only-secret-for-app-review");
  vi.stubEnv("APP_REVIEW_EMAIL", " Review@Example.edu ");
  vi.stubEnv("APP_REVIEW_CODE", "202610021234");
});

afterEach(() => vi.unstubAllEnvs());

/** Every URL path the app serves, from the app/ directory (route groups dropped). */
function appPaths(dir = path.join(process.cwd(), "app"), prefix = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      const segment = /^\(.*\)$/.test(name) ? "" : `/${name.replace(/^\[+\.*|\]+$/g, "")}`;
      return appPaths(full, `${prefix}${segment}`);
    }
    return /^(page|route)\.tsx?$/.test(name) ? [prefix || "/"] : [];
  });
}

describe("App Review config", () => {
  it("matches the env email in any case and needs a 12–32 digit code", () => {
    expect(isAppReviewEmail("REVIEW@example.edu")).toBe(true);
    expect(isAppReviewEmail("sage@example.edu")).toBe(false);
    expect(isAppReviewEmail(null)).toBe(false);
    expect(appReviewCode()).toBe("202610021234");
    vi.stubEnv("APP_REVIEW_CODE", "123456");
    expect(appReviewCode()).toBeNull();
    vi.stubEnv("APP_REVIEW_EMAIL", "");
    vi.stubEnv("APP_REVIEW_CODE", "202610021234");
    expect(appReviewCode()).toBeNull();
    expect(isAppReviewEmail("review@example.edu")).toBe(false);
  });
});

describe("App Review allowlist", () => {
  const paths = appPaths();

  it("allows only its dashboard, workspace projects and media, settings, and sign-in", () => {
    const allowedApis = [...new Set(paths.filter((p) => p.startsWith("/api/") && isAppReviewPathAllowed(p)).map((p) => p.split("/")[2]))];
    expect(allowedApis.sort()).toEqual(
      ["app", "auth", "comments", "guest-links", "media", "notification-preferences", "onboarding", "profile", "projects", "push", "workspaces"].sort()
    );
    const allowedPages = paths.filter((p) => !p.startsWith("/api/") && isAppReviewPathAllowed(p));
    for (const page of allowedPages) {
      expect(page).toMatch(/^\/($|dashboard|workspaces|projects|settings|onboarding|maintenance|sign-in|access-denied)/);
    }
  });

  it("refuses every class surface", () => {
    const classSurfaces = [
      "/groups", "/members", "/package-progress", "/package-cycles", "/grades", "/grade-editor", "/participation",
      "/master-calendar", "/show-roles", "/teleprompter", "/announcements", "/class-board", "/publishing-queue",
      "/managers", "/livestreams", "/passwords", "/equipment", "/admin", "/activity", "/extensions",
      "/extension-requests", "/brainstorming", "/information", "/live",
      "/api/hub-chat", "/api/assistant/chat", "/api/grades/admin", "/api/members", "/api/master-calendar",
      "/api/show-roles", "/api/teleprompter", "/api/announcements", "/api/package-cycle/stage", "/api/platform/users",
      "/api/admin", "/api/vault", "/api/livestreams/members",
      "/api/public/shows", "/api/slack/sync", "/api/extensions/requests/awaiting"
    ];
    for (const surface of classSurfaces) expect(isAppReviewPathAllowed(surface), surface).toBe(false);
  });

  it("refuses the grades, teleprompter and equipment hosts except sign-in", () => {
    expect(isAppReviewPathAllowed("/", "grades")).toBe(false);
    expect(isAppReviewPathAllowed("/dashboard", "equipment")).toBe(false);
    expect(isAppReviewPathAllowed("/api/auth/sign-out", "teleprompter")).toBe(true);
  });
});

describe("App Review middleware", () => {
  const cookie = (email: string) =>
    `${APP_SESSION_COOKIE_NAME}=${createAppSessionToken(
      { userId: "u1", email, name: "Someone", imageUrl: null, provider: "email", providerUserId: email },
      true
    )}`;
  const request = (pathname: string, email: string) =>
    new NextRequest(`${origin}${pathname}`, { headers: { host: "portal.example.edu", cookie: cookie(email) } });

  it("sends the review account back to its dashboard and refuses class APIs", async () => {
    const page = await middleware(request("/master-calendar", REVIEW_EMAIL));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe(`${origin}/dashboard`);
    expect((await middleware(request("/api/hub-chat", REVIEW_EMAIL))).status).toBe(403);
    expect((await middleware(request("/dashboard", REVIEW_EMAIL))).status).toBe(200);
    expect((await middleware(request("/api/projects/p1", REVIEW_EMAIL))).status).toBe(200);
  });

  it("leaves everyone else alone", async () => {
    expect((await middleware(request("/master-calendar", "sage@example.edu"))).status).toBe(200);
    vi.stubEnv("APP_REVIEW_EMAIL", "");
    expect((await middleware(request("/master-calendar", REVIEW_EMAIL))).status).toBe(200);
  });
});

describe("App Review workspaces", () => {
  it("sees only workspaces it belongs to, never ones open to all members", () => {
    expect(buildWorkspaceAccessWhere({ userId: "u1", platformRole: null, email: REVIEW_EMAIL })).toEqual({
      members: { some: { userId: "u1" } }
    });
    const normal = buildWorkspaceAccessWhere({ userId: "u2", platformRole: null, email: "sage@example.edu" });
    expect(JSON.stringify(normal)).toContain("ALL_MEMBERS");
  });
});
