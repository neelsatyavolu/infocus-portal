import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRealSessionUser, getSessionUser } from "@/src/lib/auth";
import { fail } from "@/src/lib/http";
import { isEmailAllowedToUsePlatform } from "@/src/lib/platform-admin";
import { APP_STATE, PKCE_CHALLENGE, appCallbackUrl, createAppSignInCode } from "@/src/server/app-sign-in";

const schema = z.object({
  challenge: z.string().regex(PKCE_CHALLENGE),
  state: z.string().regex(APP_STATE),
  decision: z.enum(["allow", "cancel"])
});

function redirectToApp(params: Record<string, string>) {
  const response = NextResponse.redirect(appCallbackUrl(params), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Allow / Cancel on /app-sign-in: hands a short-lived code back to the InFocus Mac app. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return fail("Forbidden", 403);
  const form = await request.formData().catch(() => null);
  const parsed = schema.safeParse({
    challenge: form?.get("challenge"),
    state: form?.get("state"),
    decision: form?.get("decision")
  });
  if (!parsed.success) return fail("This sign-in link is invalid. Start again from the InFocus app.", 400);
  const { challenge, state, decision } = parsed.data;
  if (decision === "cancel") return redirectToApp({ error: "cancelled", state });

  const [real, session] = await Promise.all([getRealSessionUser(), getSessionUser()]);
  if (!real) return fail("Unauthorized", 401);
  if (session?.userId !== real.userId) return fail("Stop viewing as someone else first.", 403);
  if (!(await isEmailAllowedToUsePlatform(real.email))) return fail("Forbidden", 403);

  return redirectToApp({ code: createAppSignInCode(real, challenge), state });
}
