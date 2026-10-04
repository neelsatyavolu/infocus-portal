import { NextResponse } from "next/server";
import { handleRouteError } from "@/src/lib/api-errors";
import { createConnectState, YOUTUBE_CONNECT_STATE_TTL_MS } from "@/src/lib/youtube-credential-crypto";
import {
  adminCalendarResultUrl,
  calendarConsentUrl,
  GOOGLE_CALENDAR_CONNECT_COOKIE,
  GOOGLE_CALENDAR_COOKIE_OPTIONS,
  GoogleCalendarError
} from "@/src/server/google-calendar-credential";
import { requireRealPlatformAdmin } from "@/src/server/youtube-connect-access";
import { credentialSecret, YoutubeConnectError } from "@/src/server/youtube-credential";

/**
 * Admin → Connect Google Calendar: off to Google's consent page. Google sends the browser back to
 * the one registered redirect (/api/admin/youtube/callback); the state's purpose routes it here.
 */
export async function GET() {
  try {
    const userId = await requireRealPlatformAdmin();
    const { state, nonce } = createConnectState(userId, credentialSecret(), Date.now(), "calendar");
    const response = NextResponse.redirect(calendarConsentUrl(state));
    response.cookies.set(GOOGLE_CALENDAR_CONNECT_COOKIE, nonce, {
      ...GOOGLE_CALENDAR_COOKIE_OPTIONS,
      maxAge: YOUTUBE_CONNECT_STATE_TTL_MS / 1000
    });
    return response;
  } catch (error) {
    if (error instanceof GoogleCalendarError || error instanceof YoutubeConnectError) {
      return NextResponse.redirect(adminCalendarResultUrl(error.message));
    }
    return handleRouteError(error);
  }
}
