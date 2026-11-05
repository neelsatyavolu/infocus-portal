import { Prisma } from "@prisma/client";
import { afterResponse } from "@/src/lib/after-response";
import { prisma } from "@/src/lib/prisma";
import {
  contestPhase,
  contestWinners,
  HARVEST_CONTEST,
  type ContestResult,
  type PrizeStatus
} from "@/src/lib/thanksgiving-board";
import { notifyGroupOfExtensionDecision } from "@/src/server/extension-grant-notify";
import { createPrizeGrant, finalCutTurnedIn, prizeRowFor } from "@/src/server/thanksgiving-prize-grant";
import { loadHarvestBoard } from "@/src/server/thanksgiving-scores";

const PRIZE_REASON = `Thanksgiving leaderboard prize: first on the board at ${HARVEST_CONTEST.closesLabel}. Pre-approved.`;

/**
 * Locks in the winners once the contest has closed: whoever is first right now (scores only
 * change through POST /api/thanksgiving, which settles before it counts anything). Writing the
 * year's row is the lock, so it happens exactly once however many requests race here. Nothing
 * is granted or announced until the reveal (revealHarvestContest).
 */
async function lockInWinners() {
  const year = HARVEST_CONTEST.year;
  const board = await loadHarvestBoard(HARVEST_CONTEST.closesAt);
  const winners = contestWinners(board.rows);
  try {
    await prisma.thanksgivingContest.create({
      data: { year, winnerUserIds: winners.map((winner) => winner.userId), winningTotal: winners[0]?.total ?? 0 }
    });
  } catch (error) {
    // Another request locked it in first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}

/**
 * At the reveal: each winner whose Cycle 2 group hasn't turned in its Final Cut gets a
 * pre-approved extension for that whole group (two winners in one group share one grant). A
 * winner whose group already turned in picks a group later (thanksgiving-prize.ts); one on no
 * Cycle 2 group gets nothing automatically. Claiming `revealedAt` is the lock, in the same
 * transaction as the grants, so it happens exactly once.
 */
async function revealHarvestContest(winnerUserIds: readonly string[], now: Date) {
  const rows = await Promise.all(winnerUserIds.map(async (winner) => ({ winner, row: await prizeRowFor(winner) })));
  const groups = [
    ...new Map(
      rows
        .flatMap(({ winner, row }) => (row && !finalCutTurnedIn(row) ? [[row.id, { row, winner }] as const] : []))
        .reverse()
    ).values()
  ];
  const grantIds = await prisma.$transaction(async (tx) => {
    const claimed = await tx.thanksgivingContest.updateMany({
      where: { year: HARVEST_CONTEST.year, revealedAt: null },
      data: { revealedAt: now }
    });
    if (claimed.count === 0) return [];
    const ids: string[] = [];
    for (const { row, winner } of groups) {
      ids.push(await createPrizeGrant(tx, { winnerId: winner, row, reason: PRIZE_REASON, now }));
    }
    if (ids.length > 0) await tx.thanksgivingContest.update({ where: { year: HARVEST_CONTEST.year }, data: { grantIds: ids } });
    return ids;
  });
  for (const id of grantIds) {
    afterResponse("notifyGroupOfExtensionDecision", () => notifyGroupOfExtensionDecision(id));
  }
}

/**
 * Locks in the winners after the close, then reveals them (and grants the prize) at
 * HARVEST_CONTEST.revealAt. Safe to call on every request: before the close it does nothing, and
 * once both have happened it is one lookup.
 */
export async function settleHarvestContest(now = new Date()) {
  const phase = contestPhase(now);
  if (phase === "open" || phase === "blind") return;
  const year = HARVEST_CONTEST.year;
  let contest = await prisma.thanksgivingContest.findUnique({ where: { year }, select: { winnerUserIds: true, revealedAt: true } });
  if (!contest) {
    await lockInWinners();
    contest = await prisma.thanksgivingContest.findUnique({ where: { year }, select: { winnerUserIds: true, revealedAt: true } });
  }
  if (phase === "revealed" && contest && !contest.revealedAt) await revealHarvestContest(contest.winnerUserIds, now);
}

type ResultGrant = { userId: string; progressRow: { groupTopic: string; members: Array<{ userId: string }> } | null };

/** Where one winner's prize went (see PrizeStatus). */
export function prizeStatusFor(winnerId: string, grants: readonly ResultGrant[], onPrizeCycleGroup: boolean): PrizeStatus {
  const covered = grants.some((grant) => grant.progressRow?.members.some((member) => member.userId === winnerId));
  if (covered) return { kind: "own-group" };
  const gift = grants.find((grant) => grant.userId === winnerId);
  if (gift) return { kind: "gifted", to: gift.progressRow?.groupTopic.trim() || "another group" };
  return onPrizeCycleGroup ? { kind: "choosing" } : { kind: "no-group" };
}

/** The revealed result, or null before the reveal. */
export async function loadHarvestContest(): Promise<ContestResult | null> {
  const contest = await prisma.thanksgivingContest.findUnique({ where: { year: HARVEST_CONTEST.year } });
  if (!contest?.revealedAt) return null;
  const [users, grants, groups] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: contest.winnerUserIds } },
      select: { id: true, name: true, nickname: true }
    }),
    prisma.packageExtensionRequest.findMany({
      where: { id: { in: contest.grantIds } },
      select: { userId: true, progressRow: { select: { groupTopic: true, members: { select: { userId: true } } } } }
    }),
    prisma.packageProgressRow.findMany({
      where: { cycleNumber: HARVEST_CONTEST.prizeCycle, members: { some: { userId: { in: contest.winnerUserIds } } } },
      select: { members: { select: { userId: true } } }
    })
  ]);
  const onGroup = new Set(groups.flatMap((group) => group.members.map((member) => member.userId)));
  return {
    winners: contest.winnerUserIds.map((userId) => {
      const user = users.find((entry) => entry.id === userId);
      return {
        userId,
        name: user?.nickname?.trim() || user?.name?.trim() || "Someone",
        prize: prizeStatusFor(userId, grants, onGroup.has(userId))
      };
    }),
    total: contest.winningTotal
  };
}
