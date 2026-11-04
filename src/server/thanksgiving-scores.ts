import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import {
  HARVEST_KINDS,
  harvestYear,
  rankBoard,
  type HarvestKind,
  type RankedEntry
} from "@/src/lib/thanksgiving-board";
import {
  BOT_REASONS,
  CATCH_RULES,
  emptyRecent,
  flagReason,
  judgeCatches,
  REGULAR_TIMING_SAMPLES,
  type CatchInput,
  type CatchVerdict
} from "@/src/lib/thanksgiving-guard";

const DAY_MS = 24 * 60 * 60_000;
/** Leaves and pies a browser counted before the board existed, carried over once per person. */
export const CARRY_OVER_CAP = { leaves: 150, pies: 25 } as const;
const CLICK_KINDS = HARVEST_KINDS.filter((kind) => CATCH_RULES[kind].minAgeMs !== null);

type Tx = Prisma.TransactionClient;

/** One person's batches run one at a time, so the rate and click-speed checks see every catch. */
async function lockPlayer(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`thanksgiving:${userId}`}))::text`;
}

async function loadRecent(tx: Tx, userId: string, year: number, now: number) {
  const rows = await tx.thanksgivingCatch.findMany({
    where: { userId, year, accepted: true, source: "play", caughtAt: { gte: new Date(now - DAY_MS - 60 * 60_000) } },
    orderBy: { caughtAt: "asc" },
    select: { kind: true, caughtAt: true }
  });
  const recent = emptyRecent();
  for (const row of rows) {
    const kind = row.kind as HarvestKind;
    if (!recent.kindTimes[kind]) continue;
    const at = row.caughtAt.getTime();
    recent.kindTimes[kind].push(at);
    if (CLICK_KINDS.includes(kind)) recent.clickTimes.push(at);
  }
  return recent;
}

function acceptedCounts(verdicts: readonly CatchVerdict[]) {
  return Object.fromEntries(
    HARVEST_KINDS.map((kind) => [kind, verdicts.filter((verdict) => verdict.accepted && verdict.kind === kind).length])
  ) as Record<HarvestKind, number>;
}

/** Flags the account when its rejections or click timing look like a script (thanksgiving-guard.ts). */
async function reviewPlayer(tx: Tx, userId: string, year: number) {
  const score = await tx.thanksgivingScore.findUnique({
    where: { userId_year: { userId, year } },
    select: { id: true, flaggedAt: true, reviewClearedAt: true }
  });
  if (!score || score.flaggedAt) return;
  const since = score.reviewClearedAt ?? new Date(0);
  const [botRejections, rateRejections, latest] = await Promise.all([
    tx.thanksgivingCatch.count({
      where: { userId, year, accepted: false, reason: { in: [...BOT_REASONS] }, receivedAt: { gt: since } }
    }),
    tx.thanksgivingCatch.count({ where: { userId, year, accepted: false, reason: "rate-limit", receivedAt: { gt: since } } }),
    tx.thanksgivingCatch.findMany({
      where: { userId, year, accepted: true, source: "play", kind: { in: CLICK_KINDS }, receivedAt: { gt: since } },
      orderBy: { caughtAt: "desc" },
      take: REGULAR_TIMING_SAMPLES + 10,
      select: { caughtAt: true, reactionMs: true }
    })
  ]);
  const oldestFirst = [...latest].reverse();
  const reason = flagReason({
    botRejections,
    rateRejections,
    clickTimes: oldestFirst.map((row) => row.caughtAt.getTime()),
    reactions: oldestFirst.flatMap((row) => (row.reactionMs === null ? [] : [row.reactionMs]))
  });
  if (reason) {
    await tx.thanksgivingScore.update({ where: { id: score.id }, data: { flaggedAt: new Date(), flagReason: reason } });
  }
}

export type RecordedBatch = { accepted: number; rejected: number };

/**
 * Judges a browser's batch of catches (src/lib/thanksgiving-guard.ts), logs every one with its
 * verdict, adds the accepted ones to the person's totals, then checks whether to flag them.
 */
export async function recordCatches(
  userId: string,
  input: { catches: readonly CatchInput[]; sentAt: number; automation: boolean },
  now = new Date()
): Promise<RecordedBatch> {
  if (input.catches.length === 0) return { accepted: 0, rejected: 0 };
  const year = harvestYear(now);
  const nowMs = now.getTime();
  const offsetMs = Number.isFinite(input.sentAt) ? nowMs - input.sentAt : 0;

  return prisma.$transaction(async (tx) => {
    await lockPlayer(tx, userId);
    const recent = await loadRecent(tx, userId, year, nowMs);
    const verdicts = judgeCatches({ catches: input.catches, now: nowMs, offsetMs, recent, automation: input.automation });
    await tx.thanksgivingCatch.createMany({
      data: verdicts.map((verdict) => ({
        userId,
        year,
        kind: verdict.kind,
        caughtAt: verdict.caughtAt,
        receivedAt: now,
        reactionMs: verdict.reactionMs,
        accepted: verdict.accepted,
        reason: verdict.reason
      }))
    });
    const counts = acceptedCounts(verdicts);
    await tx.thanksgivingScore.upsert({
      where: { userId_year: { userId, year } },
      create: { userId, year, ...counts },
      update: Object.fromEntries(HARVEST_KINDS.map((kind) => [kind, { increment: counts[kind] }]))
    });
    await reviewPlayer(tx, userId, year);
    const accepted = verdicts.filter((verdict) => verdict.accepted).length;
    return { accepted, rejected: verdicts.length - accepted };
  });
}

/** Logs a batch from a page loaded before these checks (it sends bare counts): none of it counts. */
export async function rejectOutdatedBatch(userId: string, counts: Partial<Record<HarvestKind, number>>, now = new Date()) {
  const year = harvestYear(now);
  const data = HARVEST_KINDS.flatMap((kind) => {
    const count = Math.min(Math.max(Math.floor(Number(counts[kind]) || 0), 0), 1_000);
    return count > 0 ? [{ userId, year, kind, count, caughtAt: now, accepted: false, reason: "outdated-page" }] : [];
  });
  if (data.length > 0) await prisma.thanksgivingCatch.createMany({ data });
}

/**
 * Once per person: the leaves and pies a browser counted before the board existed, capped
 * (CARRY_OVER_CAP) because a browser's own count is easy to edit. Skipped for anyone whose
 * totals already came over (a carry-over or a baseline row).
 */
export async function carryOverHarvest(userId: string, counts: { leaves: number; pies: number }, now = new Date()) {
  const year = harvestYear(now);
  const capped = {
    leaves: Math.min(Math.max(Math.floor(counts.leaves) || 0, 0), CARRY_OVER_CAP.leaves),
    pies: Math.min(Math.max(Math.floor(counts.pies) || 0, 0), CARRY_OVER_CAP.pies)
  };
  if (capped.leaves + capped.pies === 0) return;
  await prisma.$transaction(async (tx) => {
    await lockPlayer(tx, userId);
    const already = await tx.thanksgivingCatch.findFirst({
      where: { userId, year, source: { in: ["carry-over", "baseline"] } },
      select: { id: true }
    });
    if (already) return;
    const kinds = (["leaves", "pies"] as const).filter((kind) => capped[kind] > 0);
    await tx.thanksgivingCatch.createMany({
      data: kinds.map((kind) => ({ userId, year, kind, count: capped[kind], caughtAt: now, source: "carry-over" }))
    });
    await tx.thanksgivingScore.upsert({
      where: { userId_year: { userId, year } },
      create: { userId, year, ...capped },
      update: { leaves: { increment: capped.leaves }, pies: { increment: capped.pies } }
    });
  });
}

export type HarvestBoard = { year: number; rows: RankedEntry[] };

/**
 * Everyone who caught something this year, ranked; flagged accounts are left off (and so can't
 * win the contest). Names only: emails never reach the board.
 */
export async function loadHarvestBoard(now = new Date()): Promise<HarvestBoard> {
  const year = harvestYear(now);
  const scores = await prisma.thanksgivingScore.findMany({
    where: { year, flaggedAt: null },
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
