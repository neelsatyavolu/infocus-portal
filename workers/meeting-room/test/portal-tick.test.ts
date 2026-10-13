import { afterEach, describe, expect, it, vi } from "vitest";
import { MEETING_TICK_TOKEN_ID, verifyMeetingInternalToken } from "../../../src/lib/meetings/room-token";
import type { Env } from "../src/env";
import { tickPortal } from "../src/portal";

const SECRET = "test-secret-not-real-0123456789abcdef";
const env = { PORTAL_BASE_URL: "https://portal.example.edu/", MEETING_ROOM_SECRET: SECRET } as Env;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("tickPortal", () => {
  it("posts to the Portal tick route with a room-signed tick token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(tickPortal(env)).resolves.toEqual({ ok: true, status: 200 });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://portal.example.edu/api/service/meetings/tick");
    expect(init.method).toBe("POST");
    const token = String(init.headers.Authorization).replace("Bearer ", "");
    expect(await verifyMeetingInternalToken(token, SECRET, "room", MEETING_TICK_TOKEN_ID)).not.toBeNull();
  });

  it("reports a Portal failure and an unreachable Portal without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    await expect(tickPortal(env)).resolves.toEqual({ ok: false, status: 500 });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(tickPortal(env)).resolves.toEqual({ ok: false, status: null });
  });

  it("does nothing when the Portal URL or secret is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(tickPortal({ ...env, PORTAL_BASE_URL: "" })).resolves.toEqual({ ok: false, status: null });
    await expect(tickPortal({ ...env, MEETING_ROOM_SECRET: "" })).resolves.toEqual({ ok: false, status: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
