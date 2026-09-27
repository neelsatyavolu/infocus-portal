import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClassBoardPinToken, hashClassBoardPin } from "@/src/lib/class-board-pin";
import {
  LIVESTREAM_PIN_COOKIE_NAME,
  createLivestreamPinToken,
  encryptLivestreamPin,
  hashLivestreamPin,
  livestreamPinCookieMatches,
  msUntilPacificMidnight,
  readLivestreamPinToken
} from "@/src/lib/livestream-pin";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  set: vi.fn(),
  cookie: vi.fn(),
  session: vi.fn(),
  canManage: vi.fn(),
  graphicsFind: vi.fn()
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: m.cookie, set: m.set }) }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    programSetting: { findUnique: m.findUnique, update: m.update, updateMany: m.updateMany, upsert: vi.fn() },
    livestreamGraphics: { findUnique: m.graphicsFind }
  }
}));
vi.mock("@/src/lib/auth", () => ({
  getSessionUser: m.session,
  syncUserProfile: async (userId: string) => ({ id: userId, email: `${userId}@example.edu` })
}));
vi.mock("@/src/lib/platform-admin", () => ({ getPlatformAccess: async () => ({ role: null }) }));
vi.mock("@/src/server/livestream-access", () => ({ canManageLivestreams: m.canManage }));

import { POST as unlock } from "@/app/api/live/unlock/route";
import { GET as readPin, POST as rotatePin } from "@/app/api/livestreams/pin/route";
import { GET as listEvents } from "@/app/api/live/events/route";
import { GET as readOverlay } from "@/app/api/live/overlay/[key]/route";
import { POST as rotateKey } from "@/app/api/live/events/[eventId]/key/route";

const SECRET = "test-secret";
const PIN = "482193";

function settings(overrides: Record<string, unknown> = {}) {
  return {
    id: "singleton",
    cyclesPerSemester: 3,
    classBoardPinCipher: null,
    classBoardPinFailures: 0,
    classBoardPinFailureAt: null,
    livestreamPinCipher: encryptLivestreamPin(PIN, SECRET),
    livestreamPinFailures: 0,
    livestreamPinFailureAt: null,
    ...overrides
  };
}

function unlockRequest(pin: string, ip = "10.0.0.1") {
  return new Request("http://localhost/api/live/unlock", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify({ pin })
  });
}

describe("livestream pin tokens", () => {
  it("expires at the next Pacific midnight", () => {
    const sevenPmPacific = Date.parse("2026-10-03T02:00:00.000Z");
    expect(msUntilPacificMidnight(sevenPmPacific)).toBe(5 * 60 * 60 * 1000);
    const token = createLivestreamPinToken(hashLivestreamPin(PIN), SECRET, sevenPmPacific);
    expect(readLivestreamPinToken(token, SECRET, sevenPmPacific + 60_000)).not.toBeNull();
    expect(readLivestreamPinToken(token, SECRET, sevenPmPacific + 5 * 60 * 60 * 1000)).toBeNull();
  });

  it("stops matching once the PIN is rotated", () => {
    const token = createLivestreamPinToken(hashLivestreamPin(PIN), SECRET);
    expect(livestreamPinCookieMatches(token, hashLivestreamPin(PIN), SECRET)).toBe(true);
    expect(livestreamPinCookieMatches(token, hashLivestreamPin("111111"), SECRET)).toBe(false);
  });

  it("does not accept a Class Board cookie", () => {
    const classBoardToken = createClassBoardPinToken(hashClassBoardPin(PIN), SECRET);
    expect(readLivestreamPinToken(classBoardToken, SECRET)).toBeNull();
  });
});

describe("livestream dashboard access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_AUTH_SECRET = SECRET;
    m.findUnique.mockResolvedValue(settings());
    m.update.mockResolvedValue(settings());
    m.updateMany.mockResolvedValue({ count: 1 });
    m.cookie.mockReturnValue(undefined);
    m.session.mockResolvedValue(null);
    m.canManage.mockResolvedValue(false);
  });

  it("sets a dashboard cookie for the right PIN", async () => {
    const response = await unlock(unlockRequest(PIN));
    expect(response.status).toBe(200);
    expect(m.set).toHaveBeenCalledWith(
      LIVESTREAM_PIN_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: "/" })
    );
  });

  it("reserves an attempt atomically and sets no cookie for the wrong PIN", async () => {
    m.findUnique.mockResolvedValue(settings({ livestreamPinFailures: 3, livestreamPinFailureAt: new Date() }));
    const response = await unlock(unlockRequest("000000", "10.0.0.2"));
    expect(response.status).toBe(401);
    expect(m.set).not.toHaveBeenCalled();
    expect(m.updateMany).toHaveBeenCalledTimes(1);
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { id: "singleton", livestreamPinFailures: { lt: 20 } },
      data: { livestreamPinFailures: { increment: 1 } }
    });
  });

  it("starts a new window once the old one has expired", async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000);
    m.findUnique.mockResolvedValue(settings({ livestreamPinFailures: 20, livestreamPinFailureAt: old }));
    await unlock(unlockRequest("000000", "10.0.0.4"));
    expect(m.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "singleton", livestreamPinFailureAt: old },
      data: { livestreamPinFailures: 0 }
    });
  });

  it("locks out when no attempts are left in the window", async () => {
    m.findUnique.mockResolvedValue(settings({ livestreamPinFailures: 20, livestreamPinFailureAt: new Date() }));
    m.updateMany.mockResolvedValue({ count: 0 });
    const response = await unlock(unlockRequest(PIN, "10.0.0.3"));
    expect(response.status).toBe(429);
    expect(m.set).not.toHaveBeenCalled();
  });

  it("shows the PIN in Settings only to producers and managers", async () => {
    expect((await readPin()).status).toBe(401);
    m.session.mockResolvedValue({ userId: "reporter" });
    expect((await readPin()).status).toBe(403);
    m.canManage.mockResolvedValue(true);
    const response = await readPin();
    expect(response.status).toBe(200);
    expect((await response.json()).data.pin).toBe(PIN);
  });

  it("never lets a PIN session rotate the PIN", async () => {
    m.cookie.mockReturnValue({ value: createLivestreamPinToken(hashLivestreamPin(PIN), SECRET) });
    const response = await rotatePin(new Request("http://localhost/api/livestreams/pin", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("lets any signed-in Portal user or a PIN holder in, and nobody else", async () => {
    const { prisma } = await import("@/src/lib/prisma");
    Object.assign(prisma, { livestreamEvent: { findMany: vi.fn().mockResolvedValue([]) } });
    expect((await listEvents()).status).toBe(401);
    m.cookie.mockReturnValue({ value: createLivestreamPinToken(hashLivestreamPin(PIN), SECRET) });
    expect((await listEvents()).status).toBe(200);
    m.cookie.mockReturnValue(undefined);
    m.session.mockResolvedValue({ userId: "reporter" });
    expect((await listEvents()).status).toBe(200);
  });

  it("keeps making new OBS links to producers and livestream managers", async () => {
    const context = { params: Promise.resolve({ eventId: "e1" }) };
    const request = () => new Request("http://localhost/api/live/events/e1/key", { method: "POST" });
    m.cookie.mockReturnValue({ value: createLivestreamPinToken(hashLivestreamPin(PIN), SECRET) });
    expect((await rotateKey(request(), context)).status).toBe(403);
    m.cookie.mockReturnValue(undefined);
    m.session.mockResolvedValue({ userId: "reporter" });
    expect((await rotateKey(request(), context)).status).toBe(403);
  });

  it("serves overlays by key only", async () => {
    const context = (key: string) => ({ params: Promise.resolve({ key }) });
    expect((await readOverlay(new Request("http://localhost"), context("bad key!"))).status).toBe(404);
    m.graphicsFind.mockResolvedValue(null);
    expect((await readOverlay(new Request("http://localhost"), context("abcdefghijkl"))).status).toBe(404);
    m.graphicsFind.mockResolvedValue({
      scoreboard: null,
      liveImage: null,
      event: { id: "e1", title: "Varsity Boys Basketball vs. Gunn", startsAt: new Date("2026-10-03T02:00:00Z"), location: "Paly Gym" }
    });
    const response = await readOverlay(new Request("http://localhost"), context("abcdefghijkl"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.scoreboard.sport).toBe("basketball");
    expect(body.data.liveImage).toBeNull();
  });
});
