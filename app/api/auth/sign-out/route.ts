import { NextRequest, NextResponse } from "next/server";
import { getAppSessionCookieMeta, getViewAsCookieMeta, sanitizeReturnTo } from "@/src/lib/auth";
import { APP_SESSION_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { VIEW_AS_COOKIE_NAME } from "@/src/lib/view-as";

function clearSessionCookie(response: NextResponse, host?: string | null) {
  response.cookies.set(APP_SESSION_COOKIE_NAME, "", {
    ...getAppSessionCookieMeta(false, host),
    maxAge: 0
  });
  response.cookies.set(VIEW_AS_COOKIE_NAME, "", {
    ...getViewAsCookieMeta(host),
    maxAge: 0
  });

  return response;
}

export async function POST(request: NextRequest) {
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"), "/");
  return clearSessionCookie(
    NextResponse.redirect(new URL(returnTo, request.url), 303),
    request.headers.get("host")
  );
}

export async function GET(request: NextRequest) {
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"), "/");
  return clearSessionCookie(
    NextResponse.redirect(new URL(returnTo, request.url), 302),
    request.headers.get("host")
  );
}
