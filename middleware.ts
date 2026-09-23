import { NextRequest, NextResponse } from "next/server";
import { APP_SESSION_COOKIE_NAME, TELEPROMPTER_KIOSK_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { parseAppSessionToken } from "@/src/lib/auth-edge";
import { resolveAppSurface, type AppSurface } from "@/src/lib/hosts";
import {
  getTeleprompterKioskCookieMeta,
  isTeleprompterKioskPath,
  isValidTeleprompterKioskToken
} from "@/src/lib/teleprompter-kiosk";

const publicRoutePatterns = [
  /^\/$/,
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
  /^\/api\/platform\/access-requests$/,
  /^\/api\/service\/drive-roster$/,
  /^\/submit-announcement$/,
  /^\/api\/announcements\/submit$/,
  /^\/announcements\/shared$/,
  /^\/api\/announcements\/submitted\/shared$/
];

function isPublicRoute(pathname: string) {
  return publicRoutePatterns.some((pattern) => pattern.test(pathname));
}

function buildSignInUrl(req: NextRequest) {
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

    return withSurfaceHeaders(NextResponse.redirect(buildSignInUrl(req)), surface, host);
  }

  return withSurfaceHeaders(NextResponse.next(), surface, host);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)"
  ]
};
