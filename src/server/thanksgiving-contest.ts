import { Prisma } from "@prisma/client";
import { afterResponse } from "@/src/lib/after-response";
import { prisma } from "@/src/lib/prisma";
import {
  contestWinners,
  HARVEST_CONTEST,
  isContestOpen,
  prizeGrantDays,
  type ContestResult
} from "@/src/lib/thanksgiving-board";
import { notifyGroupOfExtensionDecision } from "@/src/server/extension-grant-notify";
import { resolveStudentCycleNumber } from "@/src/server/package-cycle-stage";
import { loadHarvestBoard } from "@/src/server/thanksgiving-scores";

const PRIZE_REASON = `Thanksgiving leaderboard prize: first on the board at ${HARVEST_CONTEST.closesLabel}. Pre-approved.`;


/** The winner's package group in the cycle their own tabs show, if they're on one. */
async function winnerRow(userId: string) {
  const cycleNumber = await resolveStudentCycleNumber(userId);
  return prisma.packageProgressRow.findFirst({
    where: { cycleNumber, members: { some: { userId } } },
    select: {
      id: true,
      cycleNumber: true,
      extension: true,
      extensionRequests: {
        where: { status: "APPROVED" },
        select: { requestedDays: true, grantedDays: true, grantedUserIds: true }
      }
    }
  });
}

/**
 * Locks in the contest once it has closed: whoever is first right now (scores only change through
 * POST /api/thanksgiving, which settles before it counts anything) wins a pre-approved extension
 * for their whole package group. Writing the year's row is the lock, so it happens exactly once
 * however many requests race here. Safe to call on every request; a no-op before the close.
 */
export async function settleHarvestContest(now = new Date()) {
  if (isContestOpen(now)) return;
  const year = HARVEST_CONTEST.year;
  if (await prisma.thanksgivingContest.findUnique({ where: { year }, select: { year: true } })) return;

  const board = await loadHarvestBoard(HARVEST_CONTEST.closesAt);
  const winners = contestWinners(board.rows);
  const found = await Promise.all(
    winners.map(async (winner) => ({ winner: winner.userId, row: await winnerRow(winner.userId) }))
  );
  // Two winners in one group share one grant (filed in the first one's name).
  const groups = [
    ...new Map(
      found.flatMap(({ winner, row }) => (row ? [[row.id, { ...row, winner }] as const] : [])).reverse()
    ).values()
  ];

  let grantIds: string[] = [];
  try {
    grantIds = await prisma.$transaction(async (tx) => {
      await tx.thanksgivingContest.create({
        data: { year, winnerUserIds: winners.map((winner) => winner.userId), winningTotal: winners[0]?.total ?? 0 }
      });
      const ids: string[] = [];
      for (const group of groups) {
        const wholeGroupDays = group.extension
          ? group.extensionRequests
              .filter((grant) => grant.grantedUserIds.length === 0)
              .map((grant) => grant.grantedDays ?? grant.requestedDays)
          : [];
        const days = prizeGrantDays(wholeGroupDays);
        const grant = await tx.packageExtensionRequest.create({
          data: {
            userId: group.winner,
            progressRowId: group.id,
            cycleNumber: group.cycleNumber,
            requestedDays: days,
            grantedDays: days,
            grantedUserIds: [],
            producerGranted: true,
            reason: PRIZE_REASON,
            status: "APPROVED",
            decidedAt: now
          }
        });
        await tx.packageProgressRow.update({ where: { id: group.id }, data: { extension: true } });
        ids.push(grant.id);
      }
      await tx.thanksgivingContest.update({ where: { year }, data: { grantIds: ids } });
      return ids;
    });
  } catch (error) {
    // Another request locked it in first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }

  for (const id of grantIds) {
    afterResponse("notifyGroupOfExtensionDecision", () => notifyGroupOfExtensionDecision(id));
  }
}

/** The locked-in result, or null while the contest is open (or before anyone settled it). */
export async function loadHarvestContest(): Promise<ContestResult | null> {
  const contest = await prisma.thanksgivingContest.findUnique({ where: { year: HARVEST_CONTEST.year } });
  if (!contest) return null;
  const [users, grants] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: contest.winnerUserIds } },
      select: { id: true, name: true, nickname: true }
    }),
    prisma.packageExtensionRequest.findMany({
      where: { id: { in: contest.grantIds } },
      select: { progressRow: { select: { members: { select: { userId: true } } } } }
    })
  ]);
  const covered = new Set(grants.flatMap((grant) => grant.progressRow?.members.map((member) => member.userId) ?? []));
  return {
    winners: contest.winnerUserIds.map((userId) => {
      const user = users.find((entry) => entry.id === userId);
      return { userId, name: user?.nickname?.trim() || user?.name?.trim() || "Someone" };
    }),
    total: contest.winningTotal,
    ungranted: contest.winnerUserIds.filter((userId) => !covered.has(userId))
  };
}
