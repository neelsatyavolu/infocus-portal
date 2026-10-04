import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { handleRouteError } from "@/src/lib/api-errors";
import { verifyConnectState } from "@/src/lib/youtube-credential-crypto";
import { finishGoogleCalendarConnect, GOOGLE_CALENDAR_CONNECT_COOKIE } from "@/src/server/google-calendar-credential";
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

/**
 * Google's redirect after Reconnect YouTube: check it's ours, then save the InFocus channel's authorization.
 * This is the OAuth client's only registered redirect, so Connect Google Calendar comes back here too:
 * a state signed with purpose "calendar" (and its own nonce cookie) is handed to the Calendar flow.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireRealPlatformAdmin();
    const params = new URL(request.url).searchParams;
    const cookieStore = await cookies();
    const calendarNonce = cookieStore.get(GOOGLE_CALENDAR_CONNECT_COOKIE)?.value;
    if (
      calendarNonce &&
      verifyConnectState(params.get("state"), { userId, cookieNonce: calendarNonce, secret: credentialSecret(), purpose: "calendar" })
    ) {
      return finishGoogleCalendarConnect(params, userId);
    }

    if (params.get("error")) return finish("Google sign-in was cancelled. Nothing changed.");

    const cookieNonce = cookieStore.get(YOUTUBE_CONNECT_COOKIE)?.value;
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
