import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/src/lib/http";
import { handleRouteError } from "@/src/lib/api-errors";
import { EMAIL_CODE_TTL_SECONDS, EMAIL_SIGN_IN_COOKIE, requestEmailSignInCode } from "@/src/server/email-sign-in";

const schema = z.object({ email: z.string().trim().email().max(254) });

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("Forbidden", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Enter a valid email address.", 400);
  const browserToken = randomBytes(32).toString("hex");
  try {
    await requestEmailSignInCode(parsed.data.email, browserToken);
    const response = ok({ sent: true });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(EMAIL_SIGN_IN_COOKIE, browserToken, {
      httpOnly: true, sameSite: "strict", path: "/api/auth/email",
      secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
      maxAge: EMAIL_CODE_TTL_SECONDS
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "TOO_MANY_REQUESTS") {
      return fail("Please wait before requesting another code. You can request up to 5 codes per hour.", 429);
    }
    // Do not expose database or mail-provider details on this public endpoint.
    return handleRouteError(new Error("Could not send your code. Please wait a minute and try again."));
  }
}
