import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));

import middleware from "@/middleware";
import { isTrustedReturnUrl, getAppSessionCookieMeta } from "@/src/lib/auth";
import { EQUIPMENT_STATION_COOKIE_NAME, TELEPROMPTER_KIOSK_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { EMBEDDED_APP_COOKIE } from "@/src/lib/embedded-app";
import { isEquipmentSignInOrigin, passkeyRelatedOrigins } from "@/src/lib/equipment-kiosk";
import {
  canonicalPortalDomain,
  legacyPortalRedirect,
  mainAppOrigin,
  mainOriginForHost,
  meetAppOrigin,
  meetOriginForHost,
  portalDomainOf,
  resolveSessionCookieDomain,
  linkOnCurrentPortalDomain,
  toInstalledAppUrl
} from "@/src/lib/hosts";
import { shouldUseMeetHost } from "@/src/lib/meetings/meet-host-routing";
import { passkeyContext } from "@/src/server/equipment-passkeys";

const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

function request(url: string, options: { ua?: string; cookies?: Record<string, string>; method?: string } = {}) {
  const cookie = Object.entries(options.cookies ?? {}).map(([name, value]) => `${name}=${value}`).join("; ");
  return new NextRequest(url, {
    method: options.method ?? "GET",
    headers: { host: new URL(url).host, "user-agent": options.ua ?? SAFARI, ...(cookie ? { cookie } : {}) }
  });
}

beforeEach(() => {
  vi.stubEnv("APP_AUTH_SECRET", "test-only-secret");
  vi.stubEnv("APP_BASE_URL", "https://infocusportal.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("MEET_APP_URL", "");
  vi.stubEnv("NEXT_PUBLIC_MEET_APP_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Portal domains", () => {
  it("knows which Portal domain a host is on", () => {
    expect(portalDomainOf("meet.infocuspaly.com")).toBe("infocuspaly.com");
    expect(portalDomainOf("infocusportal.com:443")).toBe("infocusportal.com");
    expect(portalDomainOf("evilinfocusportal.com")).toBeNull();
    expect(portalDomainOf("localhost")).toBeNull();
  });

  it("takes the canonical domain from APP_BASE_URL", () => {
    expect(canonicalPortalDomain()).toBe("infocusportal.com");
    expect(meetAppOrigin()).toBe("https://meet.infocusportal.com");
    vi.stubEnv("APP_BASE_URL", "https://infocuspaly.com");
    expect(canonicalPortalDomain()).toBe("infocuspaly.com");
    expect(meetAppOrigin()).toBe("https://meet.infocuspaly.com");
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(mainAppOrigin()).toBe("https://infocusportal.com");
  });

  it("sets cookies and signs in on the request's own domain", () => {
    expect(resolveSessionCookieDomain("grades.infocuspaly.com")).toBe(".infocuspaly.com");
    expect(resolveSessionCookieDomain("infocusportal.com")).toBe(".infocusportal.com");
    expect(getAppSessionCookieMeta(true, "infocuspaly.com").domain).toBe(".infocuspaly.com");
    expect(mainOriginForHost("meet.infocuspaly.com")).toBe("https://infocuspaly.com");
    expect(meetOriginForHost("www.infocusportal.com")).toBe("https://meet.infocusportal.com");
    expect(mainOriginForHost("localhost:3000")).toBe("https://infocusportal.com");
  });

  it("trusts return URLs on either domain only", () => {
    expect(isTrustedReturnUrl("https://meet.infocuspaly.com/abc")).toBe(true);
    expect(isTrustedReturnUrl("https://meet.infocusportal.com/abc")).toBe(true);
    expect(isTrustedReturnUrl("https://infocusportal.com.evil.test/")).toBe(false);
    expect(isTrustedReturnUrl("https://evilinfocusportal.com/")).toBe(false);
  });

  it("moves meetings to the Meetings host on both domains", () => {
    expect(shouldUseMeetHost("infocuspaly.com", false)).toBe(true);
    expect(shouldUseMeetHost("www.infocusportal.com", false)).toBe(true);
    expect(shouldUseMeetHost("grades.infocusportal.com", false)).toBe(false);
    expect(shouldUseMeetHost("localhost", false)).toBe(false);
  });
});

describe("the old domain", () => {
  it("sends browser pages to the same page on the canonical domain", () => {
    expect(legacyPortalRedirect("grades.infocuspaly.com", "GET", "/grades", "?x=1")).toBe("https://grades.infocusportal.com/grades?x=1");
    expect(legacyPortalRedirect("infocuspaly.com", "HEAD", "/", "")).toBe("https://infocusportal.com/");
    expect(legacyPortalRedirect("infocusportal.com", "GET", "/", "")).toBeNull();
    expect(legacyPortalRedirect("infocuspaly.com", "POST", "/sign-in", "")).toBeNull();
    expect(legacyPortalRedirect("infocuspaly.com", "GET", "/api/me", "")).toBeNull();
    expect(legacyPortalRedirect("infocuspaly.com", "GET", "/.well-known/webauthn", "")).toBeNull();
    expect(legacyPortalRedirect("localhost:3000", "GET", "/", "")).toBeNull();
    expect(legacyPortalRedirect("meet.infocuspaly.com", "GET", "/meet-scribe", "")).toBeNull();
  });

  it("redirects nothing while APP_BASE_URL still points at it", () => {
    vi.stubEnv("APP_BASE_URL", "https://infocuspaly.com");
    expect(legacyPortalRedirect("infocuspaly.com", "GET", "/dashboard", "")).toBeNull();
    expect(legacyPortalRedirect("infocusportal.com", "GET", "/dashboard", "")).toBe("https://infocuspaly.com/dashboard");
  });

  it("308s a browser in middleware", async () => {
    const response = await middleware(request("https://meet.infocuspaly.com/clabc123def456ghi789jkl?x=1"));
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe("https://meet.infocusportal.com/clabc123def456ghi789jkl?x=1");
  });

  it("keeps the iPhone app, the Mac app and kiosks where they are", async () => {
    const stays = [
      request("https://infocuspaly.com/dashboard", { ua: `${SAFARI} InFocusiOSApp/2.1` }),
      request("https://infocuspaly.com/dashboard?app=1"),
      request("https://infocuspaly.com/dashboard", { cookies: { [EMBEDDED_APP_COOKIE]: "1" } }),
      request("https://infocuspaly.com/dashboard", { ua: `${SAFARI} InFocusMacApp/1.4` }),
      request("https://teleprompter.infocuspaly.com/", { cookies: { [TELEPROMPTER_KIOSK_COOKIE_NAME]: "k" } }),
      request("https://equipment.infocuspaly.com/", { cookies: { [EQUIPMENT_STATION_COOKIE_NAME]: "s" } }),
      request("https://infocuspaly.com/api/public/shows")
    ];
    for (const req of stays) {
      const location = (await middleware(req))?.headers.get("location") ?? "";
      expect(location, req.url).not.toContain("infocusportal.com");
    }
  });
});

describe("installed apps", () => {
  it("get pushed links on the domain they were built with", () => {
    expect(toInstalledAppUrl("https://meet.infocusportal.com/abc?x=1")).toBe("https://meet.infocuspaly.com/abc?x=1");
    expect(toInstalledAppUrl("https://infocuspaly.com/settings")).toBe("https://infocuspaly.com/settings");
    expect(toInstalledAppUrl("https://www.youtube.com/watch?v=1")).toBe("https://www.youtube.com/watch?v=1");
    expect(toInstalledAppUrl("/meet/abc")).toBe("/meet/abc");
  });
});

describe("links on the old domain", () => {
  it("move to the same page on the current domain", () => {
    expect(linkOnCurrentPortalDomain("https://teleprompter.infocusportal.com/x?y=1", "infocuspaly.com")).toBe("https://teleprompter.infocuspaly.com/x?y=1");
    expect(linkOnCurrentPortalDomain("https://meet.infocuspaly.com/", "meet.infocuspaly.com")).toBeNull();
    expect(linkOnCurrentPortalDomain("https://drive.infocusportal.com/", "infocuspaly.com")).toBeNull();
    expect(linkOnCurrentPortalDomain("https://example.com/", "infocuspaly.com")).toBeNull();
    expect(linkOnCurrentPortalDomain("https://infocusportal.com/", "localhost")).toBeNull();
  });
});

describe("equipment passkeys", () => {
  it("run on both domains, and the new one may use infocuspaly.com's passkeys", () => {
    expect(isEquipmentSignInOrigin("https://equipment.infocusportal.com")).toBe(true);
    expect(isEquipmentSignInOrigin("https://equipment.infocuspaly.com")).toBe(true);
    expect(isEquipmentSignInOrigin("https://grades.infocusportal.com")).toBe(false);
    expect(passkeyRelatedOrigins()).toEqual([
      "https://equipment.infocusportal.com",
      "https://infocusportal.com",
      "https://www.infocusportal.com"
    ]);
    const passkeyRequest = new Request("https://equipment.infocusportal.com/api/equipment/public/passkeys", {
      method: "POST",
      headers: { origin: "https://equipment.infocusportal.com" }
    });
    expect(passkeyContext(passkeyRequest)).toEqual({ origin: "https://equipment.infocusportal.com", rpID: "infocuspaly.com" });
  });
});
