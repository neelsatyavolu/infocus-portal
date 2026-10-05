/**
 * Routing between the main host and the Meetings host (meet.infocuspaly.com). Pure and
 * Edge-safe: middleware.ts applies the decisions.
 *
 * Meetings host:  /            → (rewrite) /meetings
 *                 /producers   → (rewrite) /meet/producers
 *                 /<meetingId> → (rewrite) /meet/<id>
 *                 /meet/<id>   → 307 /<id>   (e.g. after a server redirect)
 *                 Meetings pages, auth pages, API, assets: as-is
 *                 anything else (sidebar links like /groups) → 307 to the main host
 * Main host:      /meet/<id>, /meet/producers, /meetings, /meetings/* → 308 to the Meetings host
 *                 (except in the iPhone app, which loads the main host; see middleware)
 */

/** cuid-like ids only, so short words (/dashboard, /settings) never look like a meeting. */
export const MEET_HOST_ID_PATH = /^\/([a-z0-9]{20,40})$/;
const MEET_PATH = /^\/meet\/([^/]+)$/;

export type MeetHostRoute =
  | { kind: "rewrite"; path: string }
  | { kind: "redirect"; location: string; status: 307 | 308 }
  | { kind: "next" };

function allowedOnMeetHost(pathname: string) {
  return (
    pathname === "/meetings" ||
    pathname.startsWith("/meetings/") ||
    pathname === "/meet-scribe" ||
    pathname.startsWith("/meet-preview/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/access-denied") ||
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/vendor/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/meet-e2ee-worker.js" ||
    // Any other static file (last segment has an extension).
    /\/[^/]+\.[A-Za-z0-9]+$/.test(pathname)
  );
}

/** A request on the Meetings host. `location`s are absolute (main host) or path-only (this host). */
export function routeMeetHost(pathname: string, search: string, mainOrigin: string): MeetHostRoute {
  if (pathname === "/" || pathname === "") return { kind: "rewrite", path: "/meetings" };
  if (pathname === "/producers") return { kind: "rewrite", path: "/meet/producers" };
  const id = MEET_HOST_ID_PATH.exec(pathname)?.[1];
  if (id) return { kind: "rewrite", path: `/meet/${id}` };
  const meetId = MEET_PATH.exec(pathname)?.[1];
  if (meetId) return { kind: "redirect", location: `/${meetId}${search}`, status: 307 };
  if (allowedOnMeetHost(pathname)) return { kind: "next" };
  return { kind: "redirect", location: `${mainOrigin.replace(/\/+$/, "")}${pathname}${search}`, status: 307 };
}

/** Old meeting links on the main host → their Meetings host URL (308); null for everything else. */
export function meetHostRedirectFromMain(pathname: string, search: string, meetOrigin: string): string | null {
  const origin = meetOrigin.replace(/\/+$/, "");
  const meetId = MEET_PATH.exec(pathname)?.[1];
  if (meetId) return `${origin}/${meetId}${search}`;
  if (pathname === "/meetings") return `${origin}/${search}`;
  if (pathname.startsWith("/meetings/")) return `${origin}${pathname}${search}`;
  return null;
}

/** The iPhone app's web view: `?app=1`, its embedded cookie, or its user-agent suffix. Stays on the main host. */
export const IOS_APP_USER_AGENT = /\bInFocusiOSApp\//;

export function isEmbeddedAppRequest(input: { appParam: string | null; embeddedCookie: string | undefined; userAgent: string | null }) {
  return input.appParam === "1" || Boolean(input.embeddedCookie) || IOS_APP_USER_AGENT.test(input.userAgent ?? "");
}

/**
 * Only move people off the main host where the Meetings host exists: production infocuspaly.com
 * hosts, or when MEET_APP_URL is set. Local dev and Vercel previews keep meetings on their own host.
 */
export function shouldUseMeetHost(host: string, meetUrlConfigured: boolean) {
  return meetUrlConfigured || host === "infocuspaly.com" || host === "www.infocuspaly.com";
}
