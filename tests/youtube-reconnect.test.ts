import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findCredential: vi.fn(),
  upsertCredential: vi.fn(),
  realUser: vi.fn(),
  allowed: vi.fn(),
  access: vi.fn(),
  cookieNonce: { value: undefined as string | undefined }
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: { youtubeCredential: { findUnique: mocks.findCredential, upsert: mocks.upsertCredential } }
}));
vi.mock("@/src/lib/auth", () => ({ getRealSessionUser: mocks.realUser }));
vi.mock("@/src/lib/platform-admin", () => ({
  isEmailAllowedToUsePlatform: mocks.allowed,
  getPlatformAccess: mocks.access
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (mocks.cookieNonce.value ? { value: mocks.cookieNonce.value } : undefined) })
}));

import { GET as callback } from "@/app/api/admin/youtube/callback/route";
import { GET as connect } from "@/app/api/admin/youtube/connect/route";
import {
  createConnectState,
  decryptRefreshToken,
  encryptRefreshToken,
  verifyConnectState
} from "@/src/lib/youtube-credential-crypto";
import { PublicationError, youtubeAccessToken, YOUTUBE_RECONNECT_MESSAGE } from "@/src/server/youtube-client";
import { connectYoutubeWithCode, YoutubeConnectError, YOUTUBE_SCOPES } from "@/src/server/youtube-credential";

const SECRET = "test-auth-secret";
const REFRESH = "1//refresh-token-value";
const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Google: token exchange, then the authorized account's channels. */
function googleReplies(channelId = "UCinfocus", scope = YOUTUBE_SCOPES.join(" ")) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return json({ access_token: "access-1", refresh_token: REFRESH, scope });
    }
    if (url.includes("/youtube/v3/channels")) return json({ items: [{ id: channelId, snippet: { title: "InFocus News" } }] });
    throw new Error(`unexpected ${url}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("APP_AUTH_SECRET", SECRET);
  vi.stubEnv("APP_BASE_URL", "https://portal.example.edu");
  vi.stubEnv("YOUTUBE_CLIENT_ID", "client-id");
  vi.stubEnv("YOUTUBE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("YOUTUBE_CHANNEL_ID", "UCinfocus");
  vi.stubEnv("YOUTUBE_PUBLISHING_START_DATE", "2026-09-01");
  vi.stubEnv("YOUTUBE_REFRESH_TOKEN", "env-refresh-token");
  mocks.realUser.mockResolvedValue({ userId: "admin-1", email: "superadmin@example.edu" });
  mocks.allowed.mockResolvedValue(true);
  mocks.access.mockResolvedValue({ canManagePlatformRoles: true });
  mocks.findCredential.mockResolvedValue(null);
  mocks.upsertCredential.mockResolvedValue({});
  mocks.cookieNonce.value = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("stored refresh token", () => {
  it("is encrypted and only readable with the same secret", () => {
    const sealed = encryptRefreshToken(REFRESH, SECRET);
    expect(sealed).not.toContain(REFRESH);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decryptRefreshToken(sealed, SECRET)).toBe(REFRESH);
    expect(decryptRefreshToken(sealed, "other-secret")).toBeNull();
    expect(decryptRefreshToken(`${sealed.slice(0, -2)}xx`, SECRET)).toBeNull();
  });
});

describe("connect state", () => {
  it("accepts only this person's unexpired state with the matching cookie", () => {
    const { state, nonce } = createConnectState("admin-1", SECRET, 1_000);
    const check = (overrides: Partial<{ userId: string; cookieNonce: string; secret: string; now: number }>) =>
      verifyConnectState(state, { userId: "admin-1", cookieNonce: nonce, secret: SECRET, now: 2_000, ...overrides });
    expect(check({})).toBe(true);
    expect(check({ userId: "someone-else" })).toBe(false);
    expect(check({ cookieNonce: "other" })).toBe(false);
    expect(check({ secret: "other-secret" })).toBe(false);
    expect(check({ now: 1_000 + 11 * 60 * 1000 })).toBe(false);
    expect(verifyConnectState(`${state}x`, { userId: "admin-1", cookieNonce: nonce, secret: SECRET, now: 2_000 })).toBe(false);
    expect(verifyConnectState(null, { userId: "admin-1", cookieNonce: nonce, secret: SECRET })).toBe(false);
  });
});

describe("connectYoutubeWithCode", () => {
  it("stores the InFocus channel's token encrypted", async () => {
    googleReplies();
    await expect(connectYoutubeWithCode("code-1", "admin-1")).resolves.toEqual({ id: "UCinfocus", title: "InFocus News" });
    const saved = mocks.upsertCredential.mock.calls[0]![0].create;
    expect(saved).toMatchObject({ id: "channel", channelId: "UCinfocus", channelTitle: "InFocus News", connectedByUserId: "admin-1" });
    expect(saved.refreshToken).not.toContain(REFRESH);
    expect(decryptRefreshToken(saved.refreshToken, SECRET)).toBe(REFRESH);
  });

  it("refuses another channel and missing permissions, saving nothing", async () => {
    googleReplies("UCsomeoneelse");
    await expect(connectYoutubeWithCode("code-1", "admin-1")).rejects.toThrow(/isn't the InFocus YouTube channel/);
    googleReplies("UCinfocus", "https://www.googleapis.com/auth/youtube.readonly");
    await expect(connectYoutubeWithCode("code-1", "admin-1")).rejects.toBeInstanceOf(YoutubeConnectError);
    expect(mocks.upsertCredential).not.toHaveBeenCalled();
  });
});

describe("connect and callback routes", () => {
  it("sends a platform admin to Google with a signed state and a matching cookie", async () => {
    const response = await connect();
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("redirect_uri")).toBe("https://portal.example.edu/api/admin/youtube/callback");
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("prompt")).toBe("consent");
    expect(response.headers.get("set-cookie")).toMatch(/infocus_youtube_connect=.+HttpOnly/i);
  });

  it("is closed to everyone but platform admins", async () => {
    mocks.access.mockResolvedValue({ canManagePlatformRoles: false });
    expect((await connect()).status).toBe(403);
    expect((await callback(new Request("https://portal.example.edu/api/admin/youtube/callback?code=c&state=s"))).status).toBe(403);
    mocks.realUser.mockResolvedValue(null);
    expect((await connect()).status).toBe(401);
  });

  it("rejects a state that didn't start in this browser", async () => {
    const { state } = createConnectState("admin-1", SECRET);
    mocks.cookieNonce.value = "not-the-nonce";
    const response = await callback(new Request(`https://portal.example.edu/api/admin/youtube/callback?code=c&state=${state}`));
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("youtube")).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves the channel and returns to Admin", async () => {
    googleReplies();
    const { state, nonce } = createConnectState("admin-1", SECRET);
    mocks.cookieNonce.value = nonce;
    const response = await callback(new Request(`https://portal.example.edu/api/admin/youtube/callback?code=c&state=${state}`));
    expect(response.headers.get("location")).toBe("https://portal.example.edu/admin?youtube=connected");
    expect(mocks.upsertCredential).toHaveBeenCalledOnce();
  });

  it("reports a wrong channel without leaking tokens", async () => {
    googleReplies("UCsomeoneelse");
    const { state, nonce } = createConnectState("admin-1", SECRET);
    mocks.cookieNonce.value = nonce;
    const response = await callback(new Request(`https://portal.example.edu/api/admin/youtube/callback?code=c&state=${state}`));
    const location = response.headers.get("location")!;
    expect(new URL(location).searchParams.get("youtubeMessage")).toMatch(/InFocus channel/);
    expect(location).not.toContain(REFRESH);
    expect(location).not.toContain("access-1");
  });
});

describe("youtubeAccessToken", () => {
  function tokenEndpoint(reply: Response) {
    fetchMock.mockResolvedValue(reply);
  }
  const sentRefreshToken = () => new URLSearchParams(String(fetchMock.mock.calls[0]![1].body)).get("refresh_token");

  it("uses the Admin connection before the env token", async () => {
    mocks.findCredential.mockResolvedValue({
      refreshToken: encryptRefreshToken("stored-refresh", SECRET),
      channelId: "UCinfocus",
      channelTitle: "InFocus News",
      connectedAt: new Date("2026-10-02T12:00:00Z")
    });
    tokenEndpoint(json({ access_token: "fresh" }));
    await expect(youtubeAccessToken()).resolves.toBe("fresh");
    expect(sentRefreshToken()).toBe("stored-refresh");
  });

  it("falls back to the env token", async () => {
    tokenEndpoint(json({ access_token: "fresh" }));
    await youtubeAccessToken();
    expect(sentRefreshToken()).toBe("env-refresh-token");
  });

  it("asks for a reconnect when Google says the token is dead, without echoing it", async () => {
    tokenEndpoint(json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400));
    const error = await youtubeAccessToken().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PublicationError);
    expect((error as Error).message).toBe(YOUTUBE_RECONNECT_MESSAGE);
    expect((error as Error).message).not.toContain("env-refresh-token");
  });

  it("says when nothing is connected at all", async () => {
    vi.stubEnv("YOUTUBE_REFRESH_TOKEN", "");
    await expect(youtubeAccessToken()).rejects.toThrow(/Reconnect YouTube in Admin/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
