import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));

import middleware from "@/middleware";
import { APP_SESSION_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { createAppSessionToken, isTrustedReturnUrl, sanitizeReturnTo } from "@/src/lib/auth";
import { EMBEDDED_APP_COOKIE } from "@/src/lib/embedded-app";
import { meetAppOrigin, resolveAppSurface } from "@/src/lib/hosts";
import { meetingNotesUrl, meetingUrl, meetingsHomeUrl, producersMeetingUrl } from "@/src/lib/meetings/links";
import { meetHostRedirectFromMain, routeMeetHost } from "@/src/lib/meetings/meet-host-routing";

const ID = "clabc123def456ghi789jkl";
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IOS_APP = `${SAFARI} InFocusiOSApp/2.1`;
const IMESSAGE = "Mozilla/5.0 facebookexternalhit/1.1 Facebot Twitterbot/1.0";
const user = { userId: "u-abby", email: "abby@example.edu", name: "Abby", imageUrl: null, provider: "google" as const, providerUserId: "g-abby" };

function request(url: string, options: { ua?: string; session?: boolean; cookies?: Record<string, string>; method?: string } = {}) {
  const parsed = new URL(url);
  const cookies = { ...(options.cookies ?? {}) };
  if (options.session) cookies[APP_SESSION_COOKIE_NAME] = createAppSessionToken(user, true);
  const cookie = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; ");
  return new NextRequest(url, {
    method: options.method ?? "GET",
    headers: { host: parsed.host, "user-agent": options.ua ?? SAFARI, ...(cookie ? { cookie } : {}) }
  });
}

const rewriteOf = (response: Response | null | undefined) => response?.headers.get("x-middleware-rewrite") ?? null;
const locationOf = (response: Response | null | undefined) => response?.headers.get("location") ?? null;

beforeEach(() => {
  vi.stubEnv("APP_AUTH_SECRET", "test-only-secret");
  vi.stubEnv("APP_BASE_URL", "https://infocuspaly.com");
  vi.stubEnv("MEET_APP_URL", "");
  vi.stubEnv("NEXT_PUBLIC_MEET_APP_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("link helpers", () => {
  it("point at the Meetings host", () => {
    expect(meetAppOrigin()).toBe("https://meet.infocuspaly.com");
    expect(meetingUrl(ID)).toBe(`https://meet.infocuspaly.com/${ID}`);
    expect(producersMeetingUrl()).toBe("https://meet.infocuspaly.com/producers");
    expect(meetingNotesUrl(ID)).toBe(`https://meet.infocuspaly.com/meetings/${ID}`);
    expect(meetingsHomeUrl()).toBe("https://meet.infocuspaly.com/");
  });

  it("follow MEET_APP_URL (server) or NEXT_PUBLIC_MEET_APP_URL (browser)", () => {
    vi.stubEnv("NEXT_PUBLIC_MEET_APP_URL", "https://meet.example.edu/");
    expect(meetingUrl(ID)).toBe(`https://meet.example.edu/${ID}`);
    vi.stubEnv("MEET_APP_URL", "https://meet2.example.edu");
    expect(producersMeetingUrl()).toBe("https://meet2.example.edu/producers");
  });

  it("recognises the meet surface", () => {
    expect(resolveAppSurface("meet.infocuspaly.com")).toBe("meet");
    expect(resolveAppSurface("infocuspaly.com")).toBe("main");
  });
});

describe("routeMeetHost (pure)", () => {
  const main = "https://infocuspaly.com";
  it("rewrites the root, the series and meeting ids", () => {
    expect(routeMeetHost("/", "", main)).toEqual({ kind: "rewrite", path: "/meetings" });
    expect(routeMeetHost("/producers", "", main)).toEqual({ kind: "rewrite", path: "/meet/producers" });
    expect(routeMeetHost(`/${ID}`, "", main)).toEqual({ kind: "rewrite", path: `/meet/${ID}` });
  });

  it("sends old-style /meet/<id> to the short path, keeping the query", () => {
    expect(routeMeetHost(`/meet/${ID}`, "?app=1", main)).toEqual({ kind: "redirect", location: `/${ID}?app=1`, status: 307 });
    expect(routeMeetHost("/meet/producers", "", main)).toEqual({ kind: "redirect", location: "/producers", status: 307 });
  });

  it("serves Meetings pages, auth pages, the scribe, previews, API and assets as they are", () => {
    for (const path of [
      "/meetings",
      `/meetings/${ID}`,
      "/meet-scribe",
      `/meet-preview/${ID}`,
      "/api/meetings",
      "/_next/static/x.js",
      "/sign-in",
      "/access-denied",
      "/maintenance",
      "/onboarding",
      "/settings",
      "/vendor/mediapipe/model.tflite",
      "/favicon.ico",
      "/meet-e2ee-worker.js",
      "/manifest.webmanifest"
    ]) {
      expect(routeMeetHost(path, "", main)).toEqual({ kind: "next" });
    }
  });

  it("sends every other page back to the main host (sidebar links keep working)", () => {
    expect(routeMeetHost("/groups", "?tab=2", main)).toEqual({ kind: "redirect", location: "https://infocuspaly.com/groups?tab=2", status: 307 });
    expect(routeMeetHost("/dashboard", "", main)).toMatchObject({ kind: "redirect", location: "https://infocuspaly.com/dashboard" });
  });
});

describe("meetHostRedirectFromMain (pure)", () => {
  const meet = "https://meet.infocuspaly.com";
  it("maps old links to the Meetings host, keeping the query", () => {
    expect(meetHostRedirectFromMain("/meet/producers", "?x=1", meet)).toBe("https://meet.infocuspaly.com/producers?x=1");
    expect(meetHostRedirectFromMain(`/meet/${ID}`, "", meet)).toBe(`https://meet.infocuspaly.com/${ID}`);
    expect(meetHostRedirectFromMain("/meetings", "?left=1", meet)).toBe("https://meet.infocuspaly.com/?left=1");
    expect(meetHostRedirectFromMain(`/meetings/${ID}`, "", meet)).toBe(`https://meet.infocuspaly.com/meetings/${ID}`);
  });

  it("leaves everything else alone", () => {
    for (const path of ["/meet-scribe", `/meet-preview/${ID}`, "/api/meetings", "/groups", "/meetingsx"]) {
      expect(meetHostRedirectFromMain(path, "", meet)).toBeNull();
    }
  });
});

describe("middleware on the Meetings host", () => {
  it("rewrites a signed-in visit to the call, the series and the tab", async () => {
    expect(rewriteOf(await middleware(request(`https://meet.infocuspaly.com/${ID}`, { session: true })))).toBe(
      `https://meet.infocuspaly.com/meet/${ID}`
    );
    expect(rewriteOf(await middleware(request("https://meet.infocuspaly.com/producers", { session: true })))).toBe(
      "https://meet.infocuspaly.com/meet/producers"
    );
    expect(rewriteOf(await middleware(request("https://meet.infocuspaly.com/", { session: true })))).toBe(
      "https://meet.infocuspaly.com/meetings"
    );
  });

  it("signs in on the main host and comes back to the exact meet URL", async () => {
    const response = await middleware(request(`https://meet.infocuspaly.com/${ID}?x=1`));
    const location = new URL(locationOf(response)!);
    expect(location.origin + location.pathname).toBe("https://infocuspaly.com/sign-in");
    expect(location.searchParams.get("returnTo")).toBe(`https://meet.infocuspaly.com/${ID}?x=1`);

    const tab = new URL(locationOf(await middleware(request(`https://meet.infocuspaly.com/meetings/${ID}`)))!);
    expect(tab.searchParams.get("returnTo")).toBe(`https://meet.infocuspaly.com/meetings/${ID}`);
  });

  it("previews for crawlers on meet-host paths, signed out", async () => {
    expect(rewriteOf(await middleware(request(`https://meet.infocuspaly.com/${ID}`, { ua: IMESSAGE })))).toBe(
      `https://meet.infocuspaly.com/meet-preview/${ID}`
    );
    expect(rewriteOf(await middleware(request("https://meet.infocuspaly.com/producers", { ua: IMESSAGE })))).toBe(
      "https://meet.infocuspaly.com/meet-preview/producers"
    );
  });

  it("redirects stray main-app pages to the main host, and /meet/<id> to the short path", async () => {
    expect(locationOf(await middleware(request("https://meet.infocuspaly.com/groups", { session: true })))).toBe(
      "https://infocuspaly.com/groups"
    );
    const short = await middleware(request(`https://meet.infocuspaly.com/meet/${ID}?app=1`, { session: true }));
    expect(short?.status).toBe(307);
    expect(locationOf(short)).toBe(`https://meet.infocuspaly.com/${ID}?app=1`);
  });

  it("leaves the scribe page and the API alone", async () => {
    const scribe = await middleware(request("https://meet.infocuspaly.com/meet-scribe"));
    expect(locationOf(scribe)).toBeNull();
    expect(rewriteOf(scribe)).toBeNull();
    const api = await middleware(request("https://meet.infocuspaly.com/api/meetings"));
    expect(api?.status).toBe(401);
  });
});

describe("middleware on the main host (old links)", () => {
  it("308s old meeting links to the Meetings host, keeping the query", async () => {
    const call = await middleware(request(`https://infocuspaly.com/meet/${ID}?x=1`, { session: true }));
    expect(call?.status).toBe(308);
    expect(locationOf(call)).toBe(`https://meet.infocuspaly.com/${ID}?x=1`);
    expect(locationOf(await middleware(request("https://infocuspaly.com/meet/producers", { session: true })))).toBe(
      "https://meet.infocuspaly.com/producers"
    );
    expect(locationOf(await middleware(request("https://infocuspaly.com/meetings")))).toBe("https://meet.infocuspaly.com/");
    expect(locationOf(await middleware(request(`https://infocuspaly.com/meetings/${ID}`)))).toBe(
      `https://meet.infocuspaly.com/meetings/${ID}`
    );
  });

  it("keeps the iPhone app on the main host (?app=1, its cookie, or its user agent)", async () => {
    for (const options of [
      { url: `https://infocuspaly.com/meet/${ID}?app=1` },
      { url: `https://infocuspaly.com/meet/${ID}`, cookies: { [EMBEDDED_APP_COOKIE]: "1" } },
      { url: "https://infocuspaly.com/meetings?left=1", ua: IOS_APP }
    ]) {
      const response = await middleware(request(options.url, { session: true, ua: options.ua, cookies: options.cookies }));
      expect(response?.status).toBe(200);
      expect(locationOf(response)).toBeNull();
    }
  });

  it("still previews old links for crawlers", async () => {
    expect(rewriteOf(await middleware(request(`https://infocuspaly.com/meet/${ID}`, { ua: IMESSAGE })))).toBe(
      `https://infocuspaly.com/meet-preview/${ID}`
    );
  });

  it("leaves the scribe, previews and the API alone", async () => {
    expect(locationOf(await middleware(request("https://infocuspaly.com/meet-scribe")))).toBeNull();
    expect(locationOf(await middleware(request(`https://infocuspaly.com/meet-preview/${ID}`)))).toBeNull();
    expect((await middleware(request("https://infocuspaly.com/api/meetings")))?.status).toBe(401);
  });

  it("doesn't move anything off local dev or preview hosts unless MEET_APP_URL is set", async () => {
    const local = await middleware(request(`http://localhost:3000/meet/${ID}`, { session: true }));
    expect(locationOf(local)).toBeNull();
    vi.stubEnv("MEET_APP_URL", "http://meet.localhost:3000");
    expect(locationOf(await middleware(request(`http://localhost:3000/meet/${ID}`, { session: true })))).toBe(
      `http://meet.localhost:3000/${ID}`
    );
  });
});

describe("returnTo after sign-in", () => {
  it("accepts https infocuspaly.com and its subdomains", () => {
    for (const url of [
      `https://meet.infocuspaly.com/${ID}?x=1`,
      "https://infocuspaly.com/groups",
      "https://grades.infocuspaly.com/grades"
    ]) {
      expect(isTrustedReturnUrl(url)).toBe(true);
      expect(sanitizeReturnTo(url)).toBe(url);
    }
  });

  it("rejects every other absolute URL", () => {
    for (const url of [
      "http://meet.infocuspaly.com/x",
      "https://evil.example.com/x",
      "https://infocuspaly.com.evil.example.com/x",
      "https://evilinfocuspaly.com/x",
      "https://user:pass@meet.infocuspaly.com/x",
      "https://meet.infocuspaly.com:8443/x",
      "https://evil.example.com\\@meet.infocuspaly.com/x",
      "https://meet.infocuspaly.com/api/auth/sign-out",
      "javascript:alert(1)",
      "//meet.infocuspaly.com/x"
    ]) {
      expect(isTrustedReturnUrl(url)).toBe(false);
      expect(sanitizeReturnTo(url)).toBe("/dashboard");
    }
  });

  it("keeps the old path rules", () => {
    expect(sanitizeReturnTo("/groups")).toBe("/groups");
    expect(sanitizeReturnTo("/api/x")).toBe("/dashboard");
  });
});
