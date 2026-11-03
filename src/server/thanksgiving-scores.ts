import { prisma } from "@/src/lib/prisma";
import {
  HARVEST_KINDS,
  harvestYear,
  isEmptyHarvest,
  rankBoard,
  type HarvestCounts,
  type RankedEntry
} from "@/src/lib/thanksgiving-board";

/** Adds a browser's batch of catches to this year's row (src/lib/thanksgiving-board.ts). */
export async function addHarvest(userId: string, counts: HarvestCounts, now = new Date()) {
  if (isEmptyHarvest(counts)) return;
  const year = harvestYear(now);
  await prisma.thanksgivingScore.upsert({
    where: { userId_year: { userId, year } },
    create: { userId, year, ...counts },
    update: Object.fromEntries(HARVEST_KINDS.map((kind) => [kind, { increment: counts[kind] }]))
  });
}

/**
 * The first time a browser joins the board it brings the leaves and pies it already counted.
 * Each field only ever goes up to that number, so a second browser or a retry never doubles it.
 */
export async function carryOverHarvest(userId: string, counts: HarvestCounts, now = new Date()) {
  if (isEmptyHarvest(counts)) return;
  const year = harvestYear(now);
  // Upsert, not create: a first batch of catches may have made the row a moment ago.
  const existing = await prisma.thanksgivingScore.upsert({
    where: { userId_year: { userId, year } },
    create: { userId, year, ...counts },
    update: {}
  });
  const raised = Object.fromEntries(
    HARVEST_KINDS.filter((kind) => counts[kind] > existing[kind]).map((kind) => [kind, counts[kind]])
  );
  if (Object.keys(raised).length > 0) {
    await prisma.thanksgivingScore.update({ where: { id: existing.id }, data: raised });
  }
}

export type HarvestBoard = { year: number; rows: RankedEntry[] };

/** Everyone who caught something this year, ranked. Names only: emails never reach the board. */
export async function loadHarvestBoard(now = new Date()): Promise<HarvestBoard> {
  const year = harvestYear(now);
  const scores = await prisma.thanksgivingScore.findMany({
    where: { year },
    select: {
      userId: true,
      leaves: true,
      pies: true,
      wishbones: true,
      giantTurkeys: true,
      pardons: true,
      user: { select: { name: true, nickname: true } }
    }
  });
  const rows = rankBoard(
    scores.map(({ user, ...counts }) => ({
      ...counts,
      name: user.nickname?.trim() || user.name?.trim() || "Someone"
    }))
  );
  return { year, rows };
}
