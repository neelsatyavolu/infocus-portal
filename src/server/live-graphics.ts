import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { parseLiveImage, type LiveImageState } from "@/src/lib/live/graphics";
import {
  applyScoreboardAction,
  parseScoreboard,
  pruneTags,
  type ScoreboardAction,
  type ScoreboardState
} from "@/src/lib/live/scoreboard";
import { prisma } from "@/src/lib/prisma";

const LOOKBACK_MS = 12 * 60 * 60 * 1000;
const LOOKAHEAD_MS = 45 * 24 * 60 * 60 * 1000;

export type LiveEventSummary = { id: string; title: string; startsAt: string; location: string };

export type LiveGraphicsPayload = {
  event: LiveEventSummary;
  overlayKey: string;
  scoreboard: ScoreboardState;
  liveImage: LiveImageState;
  serverNow: number;
};

function summarize(event: { id: string; title: string; startsAt: Date; location: string }): LiveEventSummary {
  return { id: event.id, title: event.title, startsAt: event.startsAt.toISOString(), location: event.location };
}

export function newOverlayKey() {
  return randomBytes(12).toString("base64url");
}

/** Livestreams from 12 hours ago through the next 45 days, soonest first. */
export async function listLiveEvents(now = new Date()) {
  const events = await prisma.livestreamEvent.findMany({
    where: {
      status: { not: "CANCELLED" },
      startsAt: { gte: new Date(now.getTime() - LOOKBACK_MS), lte: new Date(now.getTime() + LOOKAHEAD_MS) }
    },
    orderBy: { startsAt: "asc" },
    take: 40,
    select: { id: true, title: true, startsAt: true, location: true }
  });
  return events.map(summarize);
}

/** The 40 most recent livestreams that started more than 12 hours ago, newest first. */
export async function listPastLiveEvents(now = new Date()) {
  const events = await prisma.livestreamEvent.findMany({
    where: { status: { not: "CANCELLED" }, startsAt: { lt: new Date(now.getTime() - LOOKBACK_MS) } },
    orderBy: { startsAt: "desc" },
    take: 40,
    select: { id: true, title: true, startsAt: true, location: true }
  });
  return events.map(summarize);
}

async function findEvent(eventId: string) {
  const event = await prisma.livestreamEvent.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, startsAt: true, location: true }
  });
  if (!event) throw new Error("NOT_FOUND");
  return event;
}

/** The event's graphics row, created on first use. Two devices opening a new event at once both get the same row. */
async function ensureGraphicsRow(eventId: string) {
  const existing = await prisma.livestreamGraphics.findUnique({ where: { eventId } });
  if (existing) return existing;
  try {
    return await prisma.livestreamGraphics.create({ data: { eventId, overlayKey: newOverlayKey() } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const row = await prisma.livestreamGraphics.findUnique({ where: { eventId } });
      if (row) return row;
    }
    throw error;
  }
}

function payload(
  event: Awaited<ReturnType<typeof findEvent>>,
  row: { overlayKey: string; scoreboard: Prisma.JsonValue; liveImage: Prisma.JsonValue }
): LiveGraphicsPayload {
  return {
    event: summarize(event),
    overlayKey: row.overlayKey,
    scoreboard: parseScoreboard(row.scoreboard),
    liveImage: parseLiveImage(row.liveImage),
    serverNow: Date.now()
  };
}

export async function getLiveGraphics(eventId: string): Promise<LiveGraphicsPayload> {
  const event = await findEvent(eventId);
  return payload(event, await ensureGraphicsRow(eventId));
}

const MAX_WRITE_ATTEMPTS = 5;

/**
 * Applies operator actions to the latest saved board. The write only lands if nobody else saved
 * in between (compare on updatedAt); otherwise it re-reads and re-applies, so two operators
 * (one on the clock, one on the score) never undo each other.
 */
export async function applyScoreboardActions(eventId: string, actions: ScoreboardAction[]) {
  const event = await findEvent(eventId);
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const row = await ensureGraphicsRow(eventId);
    const now = Date.now();
    const next = pruneTags(
      actions.reduce((state, action) => applyScoreboardAction(state, action, now), parseScoreboard(row.scoreboard)),
      now
    );
    const result = await prisma.livestreamGraphics.updateMany({
      where: { eventId, updatedAt: row.updatedAt },
      data: { scoreboard: next as Prisma.InputJsonValue }
    });
    if (result.count === 1) return payload(event, { ...row, scoreboard: next as Prisma.JsonValue });
  }
  throw new Error("CONFLICT");
}

export async function saveLiveImage(eventId: string, liveImage: LiveImageState) {
  const event = await findEvent(eventId);
  const row = await ensureGraphicsRow(eventId);
  const updated = await prisma.livestreamGraphics.update({
    where: { id: row.id },
    data: { liveImage: liveImage === null ? Prisma.DbNull : (liveImage as Prisma.InputJsonValue) }
  });
  return payload(event, updated);
}

/** Gives the event a new overlay key; the old OBS URLs stop working. */
export async function rotateOverlayKey(eventId: string) {
  await findEvent(eventId);
  await prisma.livestreamGraphics.upsert({
    where: { eventId },
    update: { overlayKey: newOverlayKey() },
    create: { eventId, overlayKey: newOverlayKey() }
  });
  return getLiveGraphics(eventId);
}

/** Public read for the OBS overlays. Returns null for an unknown key. */
export async function getOverlayByKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) return null;
  const row = await prisma.livestreamGraphics.findUnique({
    where: { overlayKey: key },
    include: { event: { select: { id: true, title: true, startsAt: true, location: true } } }
  });
  if (!row) return null;
  return {
    event: summarize(row.event),
    scoreboard: parseScoreboard(row.scoreboard),
    liveImage: parseLiveImage(row.liveImage),
    serverNow: Date.now()
  };
}
