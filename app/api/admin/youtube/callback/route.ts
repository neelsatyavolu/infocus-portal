import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { handleRouteError } from "@/src/lib/api-errors";
import { verifyConnectState } from "@/src/lib/youtube-credential-crypto";
import { forgetYoutubeAuthorizationStatus } from "@/src/server/youtube-client";
import { requireRealPlatformAdmin } from "@/src/server/youtube-connect-access";
import {
  adminYoutubeResultUrl,
  connectYoutubeWithCode,
  credentialSecret,
  YOUTUBE_CONNECT_COOKIE,
  YOUTUBE_CONNECT_COOKIE_OPTIONS,
  YoutubeConnectError
} from "@/src/server/youtube-credential";

function finish(message?: string) {
  const response = NextResponse.redirect(adminYoutubeResultUrl(message));
  response.cookies.set(YOUTUBE_CONNECT_COOKIE, "", { ...YOUTUBE_CONNECT_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}

/** Google's redirect after Reconnect YouTube: check it's ours, then save the InFocus channel's authorization. */
export async function GET(request: Request) {
  try {
    const userId = await requireRealPlatformAdmin();
    const params = new URL(request.url).searchParams;
    if (params.get("error")) return finish("Google sign-in was cancelled. Nothing changed.");

    const cookieNonce = (await cookies()).get(YOUTUBE_CONNECT_COOKIE)?.value;
    if (!verifyConnectState(params.get("state"), { userId, cookieNonce, secret: credentialSecret() })) {
      return finish("That sign-in link expired or didn't start here. Press Reconnect YouTube again.");
    }
    const code = params.get("code");
    if (!code) return finish("Google didn't send a sign-in code. Try again.");

    await connectYoutubeWithCode(code, userId);
    forgetYoutubeAuthorizationStatus();
    return finish();
  } catch (error) {
    if (error instanceof YoutubeConnectError) return finish(error.message);
    if (error instanceof Error && (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN")) {
      return handleRouteError(error);
    }
    console.error("YouTube reconnect failed", error instanceof Error ? error.name : "unknown");
    return finish("Couldn't save the YouTube authorization. Try again.");
  }
}
