import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/src/lib/http";
import { handleRouteError } from "@/src/lib/api-errors";
import { createAppSessionToken, getAppSessionCookieMeta, resolveSignInReturnTo } from "@/src/lib/auth";
import { APP_SESSION_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { verifyPasswordSignIn } from "@/src/server/password-sign-in";

const schema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  returnTo: z.string().max(2048).optional()
});

// Super admin only (src/server/password-sign-in.ts). Everyone else signs in with Google or an emailed code.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("Forbidden", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Enter your username and password.", 400);
  try {
    const user = await verifyPasswordSignIn(parsed.data.username, parsed.data.password);
    if (!user) return fail("Wrong username or password.", 400);
    const response = ok({ returnTo: resolveSignInReturnTo(parsed.data.returnTo, request.nextUrl.origin) });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(APP_SESSION_COOKIE_NAME, createAppSessionToken(user, true), getAppSessionCookieMeta(true, request.headers.get("host")));
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "TOO_MANY_REQUESTS") {
      return fail("Too many tries. Wait 15 minutes, or sign in with Google or email.", 429);
    }
    // Do not expose database details on this public endpoint.
    return handleRouteError(new Error("Could not sign you in. Please try again."));
  }
}
