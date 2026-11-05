import { prisma } from "@/src/lib/prisma";
import { harvestTotal, harvestYear } from "@/src/lib/thanksgiving-board";
import { BOT_REASONS } from "@/src/lib/thanksgiving-guard";

export type ReviewRow = {
  userId: string;
  name: string;
  total: number;
  flaggedAt: string | null;
  flagReason: string | null;
  /** Catches rejected by the cheat checks this year, by reason (src/lib/thanksgiving-guard.ts). */
  rejected: Record<string, number>;
  /** Of those, the ones only a script makes. */
  botLike: number;
};

/**
 * For execs on /thanksgiving: everyone with a score, flagged first then by most rejected
 * catches, so a cheater stands out before the contest closes.
 */
export async function loadReviewRows(now = new Date()): Promise<ReviewRow[]> {
  const year = harvestYear(now);
  const [scores, rejections] = await Promise.all([
    prisma.thanksgivingScore.findMany({
      where: { year },
      select: {
        userId: true,
        leaves: true,
        goldenLeaves: true,
        pies: true,
        wishbones: true,
        giantTurkeys: true,
        pardons: true,
        bonus: true,
        flaggedAt: true,
        flagReason: true,
        user: { select: { name: true, nickname: true } }
      }
    }),
    prisma.thanksgivingCatch.groupBy({
      by: ["userId", "reason"],
      where: { year, accepted: false },
      _sum: { count: true }
    })
  ]);
  const rows = scores.map(({ user, flaggedAt, flagReason, userId, ...counts }) => {
    const rejected = Object.fromEntries(
      rejections
        .filter((entry) => entry.userId === userId && entry.reason)
        .map((entry) => [entry.reason as string, entry._sum.count ?? 0])
    );
    const botLike = BOT_REASONS.reduce((sum, reason) => sum + (rejected[reason] ?? 0), 0);
    return {
      userId,
      name: user.nickname?.trim() || user.name?.trim() || "Someone",
      total: harvestTotal(counts),
      flaggedAt: flaggedAt?.toISOString() ?? null,
      flagReason,
      rejected,
      botLike
    };
  });
  return rows.sort(
    (a, b) =>
      Number(Boolean(b.flaggedAt)) - Number(Boolean(a.flaggedAt)) ||
      b.botLike - a.botLike ||
      b.total - a.total ||
      a.name.localeCompare(b.name)
  );
}

/**
 * An exec flags an account (off the board, can't win) or clears it. Clearing also forgives the
 * rejections so far, so the same history doesn't flag it again on the next batch.
 */
export async function setReviewFlag(userId: string, flagged: boolean, by: string, now = new Date()) {
  const year = harvestYear(now);
  const score = await prisma.thanksgivingScore.findUnique({ where: { userId_year: { userId, year } }, select: { id: true } });
  if (!score) throw new Error("NOT_FOUND");
  await prisma.thanksgivingScore.update({
    where: { id: score.id },
    data: flagged
      ? { flaggedAt: now, flagReason: `Flagged by ${by}` }
      : { flaggedAt: null, flagReason: null, reviewClearedAt: now }
  });
}

/** True when the viewer's own account is flagged (they're off the board). */
export async function viewerFlag(userId: string, now = new Date()) {
  const score = await prisma.thanksgivingScore.findUnique({
    where: { userId_year: { userId, year: harvestYear(now) } },
    select: { flaggedAt: true }
  });
  return Boolean(score?.flaggedAt);
}
