import { NextRequest } from "next/server";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { createAppSessionToken, getAppSessionCookieMeta } from "@/src/lib/auth";
import { APP_SESSION_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { fail, okNoStore } from "@/src/lib/http";
import { redeemAppSignInCode } from "@/src/server/app-sign-in";

const schema = z.object({
  code: z.string().min(16).max(2048),
  verifier: z.string().min(43).max(128)
});

/**
 * Public (no session): the InFocus Mac app trades the code from /app-sign-in plus its PKCE
 * verifier for the same 30-day session the website issues, and stores it as the Portal cookie.
 */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Sign-in failed. Try again from the InFocus app.", 400);
  try {
    const user = await redeemAppSignInCode(parsed.data.code, parsed.data.verifier);
    if (!user) return fail("Sign-in expired. Try again from the InFocus app.", 400);
    const meta = getAppSessionCookieMeta(true, request.headers.get("host"));
    return okNoStore({
      token: createAppSessionToken(user, true),
      maxAgeSeconds: meta.maxAge,
      cookie: { name: APP_SESSION_COOKIE_NAME, domain: "domain" in meta ? meta.domain : null, path: meta.path }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return fail("This account can't sign in to InFocus Portal.", 403);
    }
    return handleRouteError(new Error("Could not sign you in. Try again from the InFocus app."));
  }
}
