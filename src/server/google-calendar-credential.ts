import { NextResponse } from "next/server";
import { decryptCalendarToken, encryptCalendarToken } from "@/src/lib/google-calendar-crypto";
import { mainAppOrigin } from "@/src/lib/hosts";
import { prisma } from "@/src/lib/prisma";
import { YOUTUBE_CONNECT_PATH, credentialSecret, youtubeRedirectUri } from "@/src/server/youtube-credential";

/**
 * Admin → Connect Google Calendar: the InFocus Google account meeting invites are sent from.
 * A separate credential from YouTube (never mixed into the YouTube token), using the same OAuth
 * client and its one registered redirect (/api/admin/youtube/callback, told apart by the state's purpose).
 * Errors never include tokens or Google's raw responses.
 */

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const SCOPES = [GOOGLE_CALENDAR_SCOPE, "openid", "email"];
/** Its own nonce cookie, scoped to the shared callback path. */
export const GOOGLE_CALENDAR_CONNECT_COOKIE = "infocus_gcal_connect";
const CREDENTIAL_ID = "calendar";
const REQUEST_TIMEOUT_MS = 20_000;

export class GoogleCalendarError extends Error {}

export const GOOGLE_CALENDAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
  sameSite: "lax" as const,
  path: YOUTUBE_CONNECT_PATH
};

function oauthClient() {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new GoogleCalendarError("Google sign-in isn't configured (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET).");
  }
  return { clientId, clientSecret };
}

/** Back to Admin with the outcome (`?gcal=connected`, or `?gcal=error&gcalMessage=…`). */
export function adminCalendarResultUrl(message?: string) {
  const url = new URL("/admin", mainAppOrigin());
  url.searchParams.set("gcal", message ? "error" : "connected");
  if (message) url.searchParams.set("gcalMessage", message);
  return url.toString();
}

/** Consent for calendar events only (plus the account's email), offline so Google returns a refresh token. */
export function calendarConsentUrl(state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: oauthClient().clientId,
    redirect_uri: youtubeRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state
  }).toString();
  return url.toString();
}

async function googleFetch(url: string, init: RequestInit, failure: string) {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new GoogleCalendarError(failure);
  }
}

async function accountEmail(accessToken: string) {
  const response = await googleFetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } },
    "Couldn't reach Google to read the account. Try again."
  );
  const body = response.ok ? ((await response.json()) as { email?: unknown }) : {};
  if (typeof body.email !== "string" || !body.email) throw new GoogleCalendarError("Google didn't say which account this is. Try again.");
  return body.email.toLowerCase();
}

/** Code from Google's redirect → a stored Calendar authorization. */
export async function connectGoogleCalendarWithCode(code: string, userId: string) {
  const { clientId, clientSecret } = oauthClient();
  const response = await googleFetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: youtubeRedirectUri(),
        grant_type: "authorization_code"
      })
    },
    "Couldn't reach Google to finish connecting. Try again."
  );
  if (!response.ok) throw new GoogleCalendarError(`Google didn't accept the sign-in (HTTP ${response.status}). Try again.`);
  const body = (await response.json()) as { access_token?: unknown; refresh_token?: unknown; scope?: unknown };
  if (typeof body.access_token !== "string" || typeof body.refresh_token !== "string") {
    throw new GoogleCalendarError("Google didn't return lasting access. Try again and allow every permission.");
  }
  const granted = typeof body.scope === "string" ? body.scope.split(" ") : [];
  if (!granted.includes(GOOGLE_CALENDAR_SCOPE)) {
    throw new GoogleCalendarError("Allow Google Calendar access when Google asks, then try again.");
  }
  const email = await accountEmail(body.access_token);
  const data = {
    refreshToken: encryptCalendarToken(body.refresh_token, credentialSecret()),
    accountEmail: email,
    scopes: granted.join(" "),
    connectedByUserId: userId,
    connectedAt: new Date()
  };
  await prisma.googleCalendarCredential.upsert({ where: { id: CREDENTIAL_ID }, update: data, create: { id: CREDENTIAL_ID, ...data } });
  return { accountEmail: email };
}

/** Finishes the shared callback for a Calendar connect (state already verified with purpose "calendar"). */
export async function finishGoogleCalendarConnect(params: URLSearchParams, userId: string) {
  const finish = (message?: string) => {
    const response = NextResponse.redirect(adminCalendarResultUrl(message));
    response.cookies.set(GOOGLE_CALENDAR_CONNECT_COOKIE, "", { ...GOOGLE_CALENDAR_COOKIE_OPTIONS, maxAge: 0 });
    return response;
  };
  if (params.get("error")) return finish("Google sign-in was cancelled. Nothing changed.");
  const code = params.get("code");
  if (!code) return finish("Google didn't send a sign-in code. Try again.");
  try {
    await connectGoogleCalendarWithCode(code, userId);
    return finish();
  } catch (error) {
    if (error instanceof GoogleCalendarError) return finish(error.message);
    console.error("Google Calendar connect failed", error instanceof Error ? error.name : "unknown");
    return finish("Couldn't save the Google Calendar authorization. Try again.");
  }
}

export async function googleCalendarConnection() {
  const row = await prisma.googleCalendarCredential.findUnique({
    where: { id: CREDENTIAL_ID },
    select: { accountEmail: true, connectedAt: true }
  });
  return row ? { accountEmail: row.accountEmail, connectedAt: row.connectedAt } : null;
}

/** A fresh access token, or null when Calendar isn't connected. Throws when Google refuses it. */
export async function googleCalendarAccessToken() {
  const row = await prisma.googleCalendarCredential.findUnique({ where: { id: CREDENTIAL_ID } });
  if (!row) return null;
  const refreshToken = decryptCalendarToken(row.refreshToken, credentialSecret());
  if (!refreshToken) throw new GoogleCalendarError("The Google Calendar authorization can't be read. Reconnect in Admin.");
  const { clientId, clientSecret } = oauthClient();
  const response = await googleFetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" })
    },
    "Couldn't reach Google."
  );
  if (!response.ok) {
    const reason = await response.json().then((body: { error?: unknown }) => body.error, () => undefined);
    if (reason === "invalid_grant") throw new GoogleCalendarError("Google Calendar authorization expired. Reconnect in Admin.");
    throw new GoogleCalendarError(`Google Calendar authorization failed (HTTP ${response.status}).`);
  }
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== "string") throw new GoogleCalendarError("Google returned no access token.");
  return body.access_token;
}
