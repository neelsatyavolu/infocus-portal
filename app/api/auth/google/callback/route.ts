import { NextRequest, NextResponse } from "next/server";
import {
  createAppSessionToken,
  getAppSessionCookieMeta,
  getGoogleOAuthConfig,
  getGoogleOAuthStateCookieMeta,
  parseGoogleOAuthStateToken,
  provisionGoogleUserSession,
  sanitizeReturnTo
} from "@/src/lib/auth";
import { APP_SESSION_COOKIE_NAME, GOOGLE_OAUTH_STATE_COOKIE_NAME } from "@/src/lib/auth-cookies";

import { createStationToken, EQUIPMENT_OAUTH_COOKIE_NAME, EQUIPMENT_STATION_COOKIE_NAME, getEquipmentStationCookieMeta, isEquipmentSignInOrigin } from "@/src/lib/equipment-kiosk";
import { requireEquipmentStationManager } from "@/src/server/equipment-station";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

type GoogleTokenResponse = {
  access_token?: unknown;
};

type GoogleUserInfoResponse = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
};

function getBaseUrl(request: NextRequest) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return request.nextUrl.origin;
}

function redirectToSignIn(request: NextRequest, error: string) {
  return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(error)}`, request.url));
}

function clearOAuthStateCookie(response: NextResponse, host?: string | null) {
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE_NAME, "", {
    ...getGoogleOAuthStateCookieMeta(host),
    maxAge: 0
  });

  return response;
}

async function exchangeGoogleCode(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
      grant_type: "authorization_code"
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as GoogleTokenResponse;
  return typeof payload.access_token === "string" ? payload.access_token : null;
}

async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as GoogleUserInfoResponse;
  const providerUserId = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const emailVerified = payload.email_verified === true;

  if (!providerUserId || !email || !emailVerified) {
    return null;
  }

  return {
    providerUserId,
    email,
    name: typeof payload.name === "string" ? payload.name : null,
    imageUrl: typeof payload.picture === "string" ? payload.picture : null
  };
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const equipmentState = parseGoogleOAuthStateToken(request.cookies.get(EQUIPMENT_OAUTH_COOKIE_NAME)?.value);
  const portalState = parseGoogleOAuthStateToken(request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE_NAME)?.value);
  const equipment = Boolean(equipmentState?.equipmentOrigin && equipmentState.state === state);
  const oauthState = equipment ? equipmentState : portalState;
  const equipmentOrigin = equipment ? equipmentState?.equipmentOrigin : undefined;
  const host = request.headers.get("host");
  function clearState(response: NextResponse) {
    if (!equipment) return clearOAuthStateCookie(response, host);
    response.cookies.set(EQUIPMENT_OAUTH_COOKIE_NAME, "", { ...getGoogleOAuthStateCookieMeta(host), maxAge: 0 });
    return response;
  }
  function errorRedirect(error: string) {
    return clearState(equipmentOrigin && isEquipmentSignInOrigin(equipmentOrigin)
      ? NextResponse.redirect(new URL(`/equipment?signInError=${encodeURIComponent(error)}`, equipmentOrigin))
      : redirectToSignIn(request, error));
  }

  if (!code || !state || !oauthState || oauthState.state !== state ||
      (equipmentOrigin && !isEquipmentSignInOrigin(equipmentOrigin)) || (!equipment && oauthState.equipmentOrigin)) {
    // An unrelated/stale callback must not clear another sign-in flow's state.
    if (!oauthState || oauthState.state !== state) return redirectToSignIn(request, "invalid_state");
    return errorRedirect("invalid_state");
  }

  const { clientId, clientSecret } = getGoogleOAuthConfig();
  if (!clientId || !clientSecret) {
    return errorRedirect("configuration");
  }

  const redirectUri = `${getBaseUrl(request)}/api/auth/google/callback`;
  const accessToken = await exchangeGoogleCode({
    code,
    codeVerifier: oauthState.codeVerifier,
    redirectUri,
    clientId,
    clientSecret
  });

  if (!accessToken) {
    return errorRedirect("token_exchange_failed");
  }

  const profile = await fetchGoogleProfile(accessToken);
  if (!profile) {
    return errorRedirect("profile_fetch_failed");
  }

  try {
    const sessionUser = await provisionGoogleUserSession(profile);
    if (equipmentOrigin) {
      await requireEquipmentStationManager(sessionUser.userId);
      const response = NextResponse.redirect(new URL("/equipment", equipmentOrigin));
      response.cookies.set(EQUIPMENT_STATION_COOKIE_NAME, createStationToken(sessionUser.userId), getEquipmentStationCookieMeta(host));
      return clearState(response);
    }
    const response = NextResponse.redirect(new URL(sanitizeReturnTo(oauthState.returnTo), request.url));

    response.cookies.set(
      APP_SESSION_COOKIE_NAME,
      createAppSessionToken(sessionUser, true),
      getAppSessionCookieMeta(true, host)
    );
    clearOAuthStateCookie(response, host);
    return response;
  } catch (error) {
    if (equipment) return errorRedirect(error instanceof Error && error.message === "FORBIDDEN" ? "not_manager" : "session_failed");
    if (error instanceof Error && error.message === "FORBIDDEN") {
      const deniedUrl = new URL("/access-denied", request.url);
      deniedUrl.searchParams.set("email", profile.email);
      if (profile.name) {
        deniedUrl.searchParams.set("name", profile.name);
      }

      return clearOAuthStateCookie(NextResponse.redirect(deniedUrl), host);
    }

    return clearOAuthStateCookie(redirectToSignIn(request, "session_failed"), host);
  }
}
