import { NextRequest, NextResponse } from "next/server";
import { appReviewEmail, isAppReviewEmail, isAppReviewPathAllowed } from "@/src/lib/app-review";
import { APP_SESSION_COOKIE_NAME, TELEPROMPTER_KIOSK_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { parseAppSessionToken } from "@/src/lib/auth-edge";
import { EMBEDDED_APP_COOKIE } from "@/src/lib/embedded-app";
import { mainAppOrigin, meetAppOrigin, normalizeHost, resolveAppSurface, type AppSurface } from "@/src/lib/hosts";
import { MEETING_PREVIEW_PUBLIC_PATH, meetingPreviewRewritePath } from "@/src/lib/meetings/link-preview";
import {
  isEmbeddedAppRequest,
  meetHostRedirectFromMain,
  routeMeetHost,
  shouldUseMeetHost
} from "@/src/lib/meetings/meet-host-routing";
import {
  getTeleprompterKioskCookieMeta,
  isTeleprompterKioskPath,
  isValidTeleprompterKioskToken
} from "@/src/lib/teleprompter-kiosk";

const publicRoutePatterns = [
  /^\/$/,
  /^\/privacy$/,
  /^\/support$/,
  /^\/sign-in$/,
  /^\/access-denied$/,
  /^\/maintenance$/,
  /^\/g\/.+/,
  /^\/equipment(?:\/.*)?$/,
  /^\/api\/equipment\/kiosk(?:\/.*)?$/,
  /^\/api\/equipment\/public(?:\/.*)?$/,
  /^\/api\/equipment\/me$/,
  /^\/api\/webhooks\/bunny$/,
  /^\/api\/inngest$/,
  /^\/api\/media\/[^/]+\/versions\/[^/]+\/image$/,
  /^\/api\/auth\/google\/start$/,
  /^\/api\/auth\/google\/callback$/,
  /^\/api\/auth\/email\/request$/,
  /^\/api\/auth\/email\/verify$/,
  /^\/api\/auth\/sign-out$/,
  // InFocus Mac app: code + PKCE verifier for a session (no session yet; see src/server/app-sign-in.ts).
  /^\/api\/auth\/app\/token$/,
  // Public InFocus iPhone app: shows, livestreams, show announcements, alert sign-up (src/server/public-feed.ts).
  /^\/api\/public\/(?:shows|live|news-devices)(?:\/.*)?$/,
  // Vercel Cron (CRON_SECRET bearer, checked in the handler).
  /^\/api\/cron\/news-alerts$/,
  /^\/api\/platform\/access-requests$/,
  /^\/api\/service\/drive-roster$/,
  // Meetings: room reports from the meeting-room Worker (signed internal token) and Drive Scribe notes
  // (DRIVE_SERVICE_TOKEN), both checked in the handlers; the Scribe page reads its ticket from the URL fragment.
  /^\/api\/service\/meetings\/[^/]+\/(?:room|notes)$/,
  /^\/meet-scribe$/,
  // Meeting link previews (metadata + generated image only; src/lib/meetings/link-preview.ts).
  MEETING_PREVIEW_PUBLIC_PATH,
  /^\/submit-announcement$/,
  /^\/api\/announcements\/submit$/,
  /^\/announcements\/shared$/,
  /^\/api\/announcements\/submitted\/shared$/,
  // Livestream dashboard (PIN or producer/manager session, checked in the handlers) and OBS overlays (overlay key).
  /^\/live(?:\/.*)?$/,
  /^\/api\/live(?:\/.*)?$/
];

function isPublicRoute(pathname: string) {
  return publicRoutePatterns.some((pattern) => pattern.test(pathname));
}

function buildSignInUrl(req: NextRequest, surface: AppSurface) {
  // Meetings host: sign in on the main host (Google's redirect lives there) and come back to this
  // exact meet URL (sanitizeReturnTo allows https *.infocuspaly.com).
  if (surface === "meet") {
    const signInUrl = new URL("/sign-in", mainAppOrigin());
    signInUrl.searchParams.set("returnTo", `${meetAppOrigin()}${req.nextUrl.pathname}${req.nextUrl.search}`);
    return signInUrl;
  }
  const signInUrl = new URL("/sign-in", req.url);
  const returnTo = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (returnTo !== "/") {
    signInUrl.searchParams.set("returnTo", returnTo);
  }

  return signInUrl;
}

function withSurfaceHeaders(response: NextResponse, surface: AppSurface, host: string) {
  response.headers.set("x-infocus-surface", surface);
  response.headers.set("x-infocus-host", host);
  return response;
}

function rewriteForSurface(req: NextRequest, surface: AppSurface, pathname: string) {
  if (surface === "grades") {
    // Root of grades subdomain → grades dashboard
    if (pathname === "/" || pathname === "") {
      return NextResponse.rewrite(new URL("/grades", req.url));
    }
    // Keep grades routes + shared auth/api; soft-redirect stray main-app pages home
    const allowed =
      pathname.startsWith("/grades") ||
      pathname.startsWith("/grade-editor") ||
      pathname.startsWith("/participation") ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/sign-in") ||
      pathname.startsWith("/access-denied") ||
      pathname.startsWith("/maintenance") ||
      pathname.startsWith("/onboarding") ||
      pathname.startsWith("/settings");
    if (!allowed && !pathname.startsWith("/_next")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (surface === "teleprompter") {
    if (pathname === "/" || pathname === "") {
      return NextResponse.rewrite(new URL("/teleprompter", req.url));
    }
    const allowed =
      pathname.startsWith("/teleprompter") ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/sign-in") ||
      pathname.startsWith("/access-denied") ||
      pathname.startsWith("/maintenance") ||
      pathname.startsWith("/onboarding") ||
      pathname.startsWith("/settings");
    if (!allowed && !pathname.startsWith("/_next")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (surface === "equipment") {
    if (pathname === "/" || pathname === "") {
      return NextResponse.rewrite(new URL("/equipment", req.url));
    }
    const allowed =
      pathname.startsWith("/equipment") ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/sign-in") ||
      pathname.startsWith("/access-denied") ||
      pathname.startsWith("/maintenance") ||
      pathname.startsWith("/onboarding") ||
      pathname.startsWith("/settings");
    if (!allowed && !pathname.startsWith("/_next")) {
      return NextResponse.redirect(new URL("/equipment", req.url));
    }
  }

  return null;
}

// Middleware only verifies the session JWT (no DB calls — Edge Runtime has no Prisma).
// Platform access enforcement (isEmailAllowedToUsePlatform) is intentionally handled
// at the application layer: syncUserProfile() calls assertPlatformAccess() on every
// request, throwing FORBIDDEN for revoked users before any data is returned.
export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const host = req.headers.get("host") ?? "";
  const surface = resolveAppSurface(host);
  const isApiRoute = pathname.startsWith("/api/");
  const sessionToken = req.cookies.get(APP_SESSION_COOKIE_NAME)?.value;

  // Apple App Review demo account: its sample workspace and settings only (src/lib/app-review.ts).
  if (appReviewEmail() && sessionToken) {
    const session = await parseAppSessionToken(sessionToken);
    if (session && isAppReviewEmail(session.email) && !isAppReviewPathAllowed(pathname, surface)) {
      if (isApiRoute) {
        return NextResponse.json({ error: { message: "Forbidden" } }, { status: 403, headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.redirect(new URL(surface === "main" ? "/dashboard" : "/access-denied", req.url));
    }
  }

  if (surface === "teleprompter") {
    const kioskQuery = req.nextUrl.searchParams.get("kiosk");
    if (isValidTeleprompterKioskToken(kioskQuery) && kioskQuery) {
      const cleanUrl = req.nextUrl.clone();
      cleanUrl.searchParams.delete("kiosk");
      const redirect = NextResponse.redirect(cleanUrl);
      redirect.cookies.set(TELEPROMPTER_KIOSK_COOKIE_NAME, kioskQuery, getTeleprompterKioskCookieMeta());
      return withSurfaceHeaders(redirect, surface, host);
    }
  }

  // iMessage / Slack / … crawlers fetch meeting links signed out: serve them the metadata-only
  // preview page instead of a sign-in redirect. Rewrite, not redirect, so the shared URL stays as is.
  // Runs before the host routing so old /meet/<id> links and Meetings host links both preview.
  const previewPath = meetingPreviewRewritePath(pathname, req.method, req.headers.get("user-agent"), surface === "meet");
  if (previewPath) {
    return withSurfaceHeaders(NextResponse.rewrite(new URL(previewPath, req.url)), surface, host);
  }

  if (surface === "meet") {
    const route = routeMeetHost(pathname, req.nextUrl.search, mainAppOrigin());
    if (route.kind === "redirect") {
      return withSurfaceHeaders(NextResponse.redirect(new URL(route.location, req.url), route.status), surface, host);
    }
    if (route.kind === "rewrite") {
      // Rewritten pages skip the checks below, so sign in here (back to this exact meet URL after).
      if (!(await parseAppSessionToken(sessionToken))) {
        return withSurfaceHeaders(NextResponse.redirect(buildSignInUrl(req, surface)), surface, host);
      }
      return withSurfaceHeaders(NextResponse.rewrite(new URL(route.path, req.url)), surface, host);
    }
  }

  // Old meeting links on the main host → the Meetings host (308, query kept). Not in the iPhone
  // app (it loads the main host and watches for /meetings), and not where no Meetings host exists.
  if (surface === "main" && shouldUseMeetHost(normalizeHost(host), Boolean(process.env.MEET_APP_URL?.trim()))) {
    const target = meetHostRedirectFromMain(pathname, req.nextUrl.search, meetAppOrigin());
    const embedded = isEmbeddedAppRequest({
      appParam: req.nextUrl.searchParams.get("app"),
      embeddedCookie: req.cookies.get(EMBEDDED_APP_COOKIE)?.value,
      userAgent: req.headers.get("user-agent")
    });
    if (target && !embedded) {
      return withSurfaceHeaders(NextResponse.redirect(target, 308), surface, host);
    }
  }

  const surfaceRewrite = rewriteForSurface(req, surface, pathname);
  if (surfaceRewrite) {
    return withSurfaceHeaders(surfaceRewrite, surface, host);
  }

  if (pathname === "/class-board") {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-infocus-class-board", "1");
    return withSurfaceHeaders(NextResponse.next({ request: { headers: requestHeaders } }), surface, host);
  }

  if (pathname === "/api/class-board/unlock") {
    return withSurfaceHeaders(NextResponse.next(), surface, host);
  }

  if (isPublicRoute(pathname)) {
    return withSurfaceHeaders(NextResponse.next(), surface, host);
  }

  const session = await parseAppSessionToken(sessionToken);

  if (!session) {
    const kioskCookie = req.cookies.get(TELEPROMPTER_KIOSK_COOKIE_NAME)?.value;
    if (
      surface === "teleprompter" &&
      isTeleprompterKioskPath(pathname) &&
      isValidTeleprompterKioskToken(kioskCookie)
    ) {
      return withSurfaceHeaders(NextResponse.next(), surface, host);
    }

    if (isApiRoute) {
      return NextResponse.json(
        { error: { message: "Unauthorized" } },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    return withSurfaceHeaders(NextResponse.redirect(buildSignInUrl(req, surface)), surface, host);
  }

  return withSurfaceHeaders(NextResponse.next(), surface, host);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|wasm|mjs|tflite)).*)",
    "/(api|trpc)(.*)"
  ]
};
