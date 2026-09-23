import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createGoogleOAuthStateToken,
  getGoogleOAuthConfig,
  getGoogleOAuthStateCookieMeta,
  hasGoogleOAuthConfig,
  sanitizeReturnTo
} from "@/src/lib/auth";
import { GOOGLE_OAUTH_STATE_COOKIE_NAME } from "@/src/lib/auth-cookies";

import { EQUIPMENT_OAUTH_COOKIE_NAME, isEquipmentSignInOrigin } from "@/src/lib/equipment-kiosk";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

function getBaseUrl(request: NextRequest) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return request.nextUrl.origin;
}

function createCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function createCodeChallenge(codeVerifier: string) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

export async function GET(request: NextRequest) {
  const equipment = request.nextUrl.searchParams.get("equipment") === "1";
  const equipmentOrigin = equipment ? request.nextUrl.origin : undefined;
  if (equipmentOrigin && !isEquipmentSignInOrigin(equipmentOrigin)) {
    return new NextResponse("Unsupported equipment sign-in origin", { status: 400 });
  }
  if (!hasGoogleOAuthConfig()) {
    if (equipment) return NextResponse.redirect(new URL("/equipment?signInError=configuration", request.url));
    return NextResponse.redirect(new URL("/sign-in?error=configuration", request.url));
  }

  const { clientId } = getGoogleOAuthConfig();
  const state = crypto.randomUUID();
  const codeVerifier = createCodeVerifier();
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const redirectUri = `${getBaseUrl(request)}/api/auth/google/callback`;

  const googleUrl = new URL(GOOGLE_AUTH_URL);
  googleUrl.searchParams.set("client_id", clientId);
  googleUrl.searchParams.set("redirect_uri", redirectUri);
  googleUrl.searchParams.set("response_type", "code");
  googleUrl.searchParams.set("scope", "openid email profile");
  googleUrl.searchParams.set("state", state);
  googleUrl.searchParams.set("code_challenge", createCodeChallenge(codeVerifier));
  googleUrl.searchParams.set("code_challenge_method", "S256");
  googleUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(googleUrl);
  response.cookies.set(
    equipment ? EQUIPMENT_OAUTH_COOKIE_NAME : GOOGLE_OAUTH_STATE_COOKIE_NAME,
    createGoogleOAuthStateToken({
      state,
      codeVerifier,
      returnTo,
      ...(equipmentOrigin ? { equipmentOrigin } : {})
    }),
    getGoogleOAuthStateCookieMeta(request.headers.get("host"))
  );
  return response;
}
