import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyScoreboardAction, defaultScoreboard } from "@/src/lib/live/scoreboard";

const m = vi.hoisted(() => ({
  eventFind: vi.fn(),
  eventFindMany: vi.fn(),
  graphicsFind: vi.fn(),
  graphicsCreate: vi.fn(),
  updateMany: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    livestreamEvent: { findUnique: m.eventFind, findMany: m.eventFindMany },
    livestreamGraphics: { findUnique: m.graphicsFind, create: m.graphicsCreate, updateMany: m.updateMany }
  }
}));

import { applyScoreboardActions, getLiveGraphics, listLiveEvents, listPastLiveEvents } from "@/src/server/live-graphics";

const EVENT = { id: "e1", title: "Varsity Boys Basketball vs. Gunn", startsAt: new Date("2026-10-03T02:00:00Z"), location: "Paly Gym" };

function row(scoreboard: unknown, updatedAt: Date) {
  return { id: "g1", eventId: "e1", overlayKey: "abcdefghijkl", scoreboard, liveImage: null, updatedAt };
}

describe("live graphics persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.eventFind.mockResolvedValue(EVENT);
  });

  it("re-applies actions on top of a concurrent save instead of overwriting it", async () => {
    const first = defaultScoreboard("basketball");
    const running = applyScoreboardAction(first, { type: "clockToggle" }, Date.now());
    m.graphicsFind
      .mockResolvedValueOnce(row(first, new Date(1)))
      .mockResolvedValueOnce(row(running, new Date(2)));
    m.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const result = await applyScoreboardActions("e1", [{ type: "score", team: 1, delta: 2 }]);

    expect(m.updateMany).toHaveBeenCalledTimes(2);
    expect(m.updateMany.mock.calls[1][0].where).toEqual({ eventId: "e1", updatedAt: new Date(2) });
    expect(result.scoreboard.teams[1].score).toBe(2);
    expect(result.scoreboard.clock.running).toBe(true);
  });

  it("gives up with a conflict after repeated collisions", async () => {
    m.graphicsFind.mockResolvedValue(row(defaultScoreboard(), new Date(1)));
    m.updateMany.mockResolvedValue({ count: 0 });
    await expect(applyScoreboardActions("e1", [{ type: "flag" }])).rejects.toThrow("CONFLICT");
  });

  it("reads without writing and survives two devices creating the row at once", async () => {
    m.graphicsFind.mockResolvedValueOnce(null).mockResolvedValueOnce(row(null, new Date(1)));
    const { Prisma } = await import("@prisma/client");
    m.graphicsCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }));
    const payload = await getLiveGraphics("e1");
    expect(payload.overlayKey).toBe("abcdefghijkl");
    expect(payload.scoreboard.sport).toBe("basketball");
  });

  it("throws NOT_FOUND for an unknown event", async () => {
    m.eventFind.mockResolvedValue(null);
    await expect(getLiveGraphics("missing")).rejects.toThrow("NOT_FOUND");
  });
});

describe("live event lists", () => {
  const NOW = new Date("2026-10-10T19:00:00Z");
  const CUTOFF = new Date("2026-10-10T07:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    m.eventFindMany.mockResolvedValue([EVENT]);
  });

  it("lists current livestreams from 12 hours ago, soonest first", async () => {
    expect(await listLiveEvents(NOW)).toEqual([
      { id: "e1", title: EVENT.title, startsAt: "2026-10-03T02:00:00.000Z", location: "Paly Gym" }
    ]);
    const query = m.eventFindMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ status: { not: "CANCELLED" }, startsAt: { gte: CUTOFF } });
    expect(query.orderBy).toEqual({ startsAt: "asc" });
  });

  it("lists past livestreams older than 12 hours, newest first, without cancelled ones", async () => {
    expect(await listPastLiveEvents(NOW)).toEqual([
      { id: "e1", title: EVENT.title, startsAt: "2026-10-03T02:00:00.000Z", location: "Paly Gym" }
    ]);
    const query = m.eventFindMany.mock.calls[0][0];
    expect(query.where).toEqual({ status: { not: "CANCELLED" }, startsAt: { lt: CUTOFF } });
    expect(query.orderBy).toEqual({ startsAt: "desc" });
    expect(query.take).toBe(40);
  });
});
