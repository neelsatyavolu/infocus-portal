import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/src/lib/http";
import { handleRouteError } from "@/src/lib/api-errors";
import { createAppSessionToken, getAppSessionCookieMeta, sanitizeReturnTo } from "@/src/lib/auth";
import { APP_SESSION_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { EMAIL_SIGN_IN_COOKIE, verifyEmailSignInCode } from "@/src/server/email-sign-in";

const schema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().trim().regex(/^\d{6}$/),
  returnTo: z.string().max(2048).optional()
});

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("Forbidden", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Enter your email and six-digit code.", 400);
  const browserToken = request.cookies.get(EMAIL_SIGN_IN_COOKIE)?.value;
  if (!browserToken) return fail("Your code expired. Please request a new code.", 400);
  try {
    const user = await verifyEmailSignInCode(parsed.data.email, parsed.data.code, browserToken);
    if (!user) return fail("This code is invalid or expired. Try again or request a new code.", 400);
    // Resolve as a URL too: URL parsing can normalize backslashes into an external host.
    const target = new URL(sanitizeReturnTo(parsed.data.returnTo), request.nextUrl.origin);
    const returnTo = target.origin === request.nextUrl.origin ? `${target.pathname}${target.search}${target.hash}` : "/dashboard";
    const response = ok({ returnTo });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(APP_SESSION_COOKIE_NAME, createAppSessionToken(user, true), getAppSessionCookieMeta(true, request.headers.get("host")));
    response.cookies.set(EMAIL_SIGN_IN_COOKIE, "", {
      httpOnly: true, sameSite: "strict", path: "/api/auth/email",
      secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1", maxAge: 0
    });
    return response;
  } catch {
    return handleRouteError(new Error("Could not sign you in. Please request a new code and try again."));
  }
}
