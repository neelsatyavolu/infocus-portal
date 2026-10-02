import { NextResponse } from "next/server";
import { handleRouteError } from "@/src/lib/api-errors";
import { createConnectState, YOUTUBE_CONNECT_STATE_TTL_MS } from "@/src/lib/youtube-credential-crypto";
import { requireRealPlatformAdmin } from "@/src/server/youtube-connect-access";
import {
  adminYoutubeResultUrl,
  credentialSecret,
  googleConsentUrl,
  YOUTUBE_CONNECT_COOKIE,
  YOUTUBE_CONNECT_COOKIE_OPTIONS,
  YoutubeConnectError
} from "@/src/server/youtube-credential";

/** Admin → Reconnect YouTube: off to Google's consent page, with a state only this browser can finish. */
export async function GET() {
  try {
    const userId = await requireRealPlatformAdmin();
    const { state, nonce } = createConnectState(userId, credentialSecret());
    const response = NextResponse.redirect(googleConsentUrl(state));
    response.cookies.set(YOUTUBE_CONNECT_COOKIE, nonce, {
      ...YOUTUBE_CONNECT_COOKIE_OPTIONS,
      maxAge: YOUTUBE_CONNECT_STATE_TTL_MS / 1000
    });
    return response;
  } catch (error) {
    if (error instanceof YoutubeConnectError) return NextResponse.redirect(adminYoutubeResultUrl(error.message));
    return handleRouteError(error);
  }
}
