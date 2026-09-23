import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ provision: vi.fn(), manager: vi.fn() }));
vi.mock("@/src/lib/auth", async (original) => ({ ...await original<typeof import("@/src/lib/auth")>(), provisionGoogleUserSession: m.provision }));
vi.mock("@/src/server/equipment-station", () => ({ requireEquipmentStationManager: m.manager }));
import { GET as start } from "@/app/api/auth/google/start/route";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { createGoogleOAuthStateToken, parseGoogleOAuthStateToken } from "@/src/lib/auth";
import { EQUIPMENT_OAUTH_COOKIE_NAME, EQUIPMENT_STATION_COOKIE_NAME, parseStationToken } from "@/src/lib/equipment-kiosk";
import { APP_SESSION_COOKIE_NAME, GOOGLE_OAUTH_STATE_COOKIE_NAME } from "@/src/lib/auth-cookies";
const origin = "https://equipment.infocuspaly.com";
const callbackOrigin = "https://infocuspaly.com";
function callbackRequest(equipment = true, state = "state") {
  const token = createGoogleOAuthStateToken({ state: "state", codeVerifier: "verifier", returnTo: "/dashboard", ...(equipment ? { equipmentOrigin: origin } : {}) });
  return new NextRequest(`${callbackOrigin}/api/auth/google/callback?code=code&state=${state}`, {
    headers: { host: "infocuspaly.com", cookie: `${equipment ? EQUIPMENT_OAUTH_COOKIE_NAME : GOOGLE_OAUTH_STATE_COOKIE_NAME}=${token}; ${APP_SESSION_COOKIE_NAME}=existing-portal-session` }
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_AUTH_SECRET", "test-auth-secret");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
  vi.stubEnv("APP_BASE_URL", callbackOrigin);
  m.provision.mockResolvedValue({ userId: "manager", email: "m@example.com", name: "Manager", imageUrl: null, provider: "google", providerUserId: "123" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-token" }))).mockResolvedValueOnce(new Response(JSON.stringify({ sub: "123", email: "m@example.com", email_verified: true }))));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("equipment Google OAuth isolation", () => {
  it("starts using a distinct state cookie and the existing registered callback", async () => {
    const response = await start(new NextRequest(`${origin}/api/auth/google/start?equipment=1`, { headers: { host: "equipment.infocuspaly.com" } }));
    const google = new URL(response.headers.get("location")!);
    expect(google.searchParams.get("redirect_uri")).toBe(`${callbackOrigin}/api/auth/google/callback`);
    expect(parseGoogleOAuthStateToken(response.cookies.get(EQUIPMENT_OAUTH_COOKIE_NAME)?.value)?.equipmentOrigin).toBe(origin);
    expect(response.cookies.get(GOOGLE_OAUTH_STATE_COOKIE_NAME)).toBeUndefined();
    expect(response.cookies.get(APP_SESSION_COOKIE_NAME)).toBeUndefined();
  });
  it("sets only the one-hour equipment session after checking manager access", async () => {
    const response = await callback(callbackRequest());
    expect(response.headers.get("location")).toBe(`${origin}/equipment`);
    expect(m.manager).toHaveBeenCalledWith("manager");
    const cookie = response.cookies.get(EQUIPMENT_STATION_COOKIE_NAME);
    expect(cookie).toMatchObject({ maxAge: 3600, httpOnly: true, domain: ".infocuspaly.com" });
    expect(parseStationToken(cookie?.value)?.userId).toBe("manager");
    expect(response.cookies.get(APP_SESSION_COOKIE_NAME)).toBeUndefined();
    expect(response.cookies.get(GOOGLE_OAUTH_STATE_COOKIE_NAME)).toBeUndefined();
    expect(response.cookies.get(EQUIPMENT_OAUTH_COOKIE_NAME)?.maxAge).toBe(0);
  });
  it("rejects a student who is not an equipment manager", async () => {
    m.manager.mockRejectedValue(new Error("FORBIDDEN"));
    const response = await callback(callbackRequest());
    expect(response.headers.get("location")).toContain("signInError=not_manager");
    expect(response.cookies.get(EQUIPMENT_STATION_COOKIE_NAME)).toBeUndefined();
    expect(response.cookies.get(APP_SESSION_COOKIE_NAME)).toBeUndefined();
  });
  it("rejects a mismatched OAuth state", async () => {
    const response = await callback(callbackRequest(true, "wrong-state"));
    expect(m.provision).not.toHaveBeenCalled();
    expect(response.cookies.get(EQUIPMENT_STATION_COOKIE_NAME)).toBeUndefined();
  });
  it("keeps regular Portal Google sign-in working without unlocking equipment", async () => {
    const response = await callback(callbackRequest(false));
    expect(response.cookies.get(APP_SESSION_COOKIE_NAME)).toBeDefined();
    expect(response.cookies.get(EQUIPMENT_STATION_COOKIE_NAME)).toBeUndefined();
    expect(m.manager).not.toHaveBeenCalled();
  });
});
