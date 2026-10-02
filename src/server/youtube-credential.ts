import { mainAppOrigin } from "@/src/lib/hosts";
import { prisma } from "@/src/lib/prisma";
import { decryptRefreshToken, encryptRefreshToken } from "@/src/lib/youtube-credential-crypto";

/**
 * The channel authorization saved by Admin → Reconnect YouTube (Google OAuth, offline access).
 * Errors here never include tokens or Google's raw responses.
 */

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube"
];
export const YOUTUBE_CONNECT_COOKIE = "infocus_youtube_connect";
export const YOUTUBE_CONNECT_PATH = "/api/admin/youtube";
const CREDENTIAL_ID = "channel";
const REQUEST_TIMEOUT_MS = 20_000;

export class YoutubeConnectError extends Error {}

export function credentialSecret() {
  const secret = process.env.APP_AUTH_SECRET?.trim();
  if (!secret) throw new YoutubeConnectError("APP_AUTH_SECRET is required to store the YouTube authorization.");
  return secret;
}

export function youtubeRedirectUri() {
  return `${mainAppOrigin().replace(/\/$/, "")}${YOUTUBE_CONNECT_PATH}/callback`;
}

/** Back to Admin with the outcome (`?youtube=connected`, or `?youtube=error&youtubeMessage=…`). */
export function adminYoutubeResultUrl(message?: string) {
  const url = new URL("/admin", mainAppOrigin());
  url.searchParams.set("youtube", message ? "error" : "connected");
  if (message) url.searchParams.set("youtubeMessage", message);
  return url.toString();
}

export const YOUTUBE_CONNECT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
  sameSite: "lax" as const,
  path: YOUTUBE_CONNECT_PATH
};

function oauthClient() {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  const channelId = process.env.YOUTUBE_CHANNEL_ID?.trim();
  if (!clientId || !clientSecret || !channelId) {
    throw new YoutubeConnectError("YouTube isn't configured (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_CHANNEL_ID).");
  }
  return { clientId, clientSecret, channelId };
}

/** Google's consent page: offline access so Google returns a refresh token every time. */
export function googleConsentUrl(state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: oauthClient().clientId,
    redirect_uri: youtubeRedirectUri(),
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state
  }).toString();
  return url.toString();
}

async function googleFetch(url: string, init: RequestInit, failure: string) {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new YoutubeConnectError(failure);
  }
}

/** The InFocus channel the new authorization belongs to, or an error naming the problem. */
async function authorizedChannel(accessToken: string, expectedChannelId: string) {
  const response = await googleFetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } },
    "Couldn't reach YouTube to check the channel. Try again."
  );
  if (!response.ok) throw new YoutubeConnectError(`YouTube refused the channel check (HTTP ${response.status}). Try again.`);
  const items = ((await response.json()) as { items?: { id?: string; snippet?: { title?: string } }[] }).items ?? [];
  const channel = items.find((item) => item.id === expectedChannelId);
  if (!channel) {
    throw new YoutubeConnectError(
      "That Google account isn't the InFocus YouTube channel. Reconnect and choose the InFocus channel (its Brand Account)."
    );
  }
  return { id: expectedChannelId, title: channel.snippet?.title?.trim() || "InFocus" };
}

/** Code from Google's redirect → a verified, stored channel authorization. */
export async function connectYoutubeWithCode(code: string, userId: string) {
  const { clientId, clientSecret, channelId } = oauthClient();
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
  if (!response.ok) throw new YoutubeConnectError(`Google didn't accept the sign-in (HTTP ${response.status}). Try again.`);
  const body = (await response.json()) as { access_token?: unknown; refresh_token?: unknown; scope?: unknown };
  if (typeof body.access_token !== "string" || typeof body.refresh_token !== "string") {
    throw new YoutubeConnectError("Google didn't return lasting access. Try again and allow every permission.");
  }
  const granted = typeof body.scope === "string" ? body.scope.split(" ") : [];
  const missing = YOUTUBE_SCOPES.filter((scope) => !granted.includes(scope));
  if (missing.length > 0) throw new YoutubeConnectError("Allow every YouTube permission Google asks for, then try again.");

  const channel = await authorizedChannel(body.access_token, channelId);
  const data = {
    refreshToken: encryptRefreshToken(body.refresh_token, credentialSecret()),
    channelId: channel.id,
    channelTitle: channel.title,
    scopes: granted.join(" "),
    connectedByUserId: userId,
    connectedAt: new Date()
  };
  await prisma.youtubeCredential.upsert({ where: { id: CREDENTIAL_ID }, update: data, create: { id: CREDENTIAL_ID, ...data } });
  return channel;
}

/** The stored authorization, decrypted; null when there is none or it can't be read. */
export async function loadYoutubeCredential() {
  const row = await prisma.youtubeCredential.findUnique({ where: { id: CREDENTIAL_ID } });
  if (!row) return null;
  const refreshToken = decryptRefreshToken(row.refreshToken, credentialSecret());
  if (!refreshToken) return null;
  return { refreshToken, channelId: row.channelId, channelTitle: row.channelTitle, connectedAt: row.connectedAt };
}
