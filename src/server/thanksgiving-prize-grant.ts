import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { HARVEST_CONTEST, prizeGrantDays } from "@/src/lib/thanksgiving-board";

/** What the prize needs to know about a Cycle 2 package group. */
export const PRIZE_ROW_SELECT = {
  id: true,
  cycleNumber: true,
  extension: true,
  finalCut: true,
  finalCutMediaItemId: true,
  extensionRequests: {
    where: { status: "APPROVED" },
    select: { requestedDays: true, grantedDays: true, grantedUserIds: true }
  }
} satisfies Prisma.PackageProgressRowSelect;

export type PrizeRow = Prisma.PackageProgressRowGetPayload<{ select: typeof PRIZE_ROW_SELECT }>;

/** A group has turned in its Final Cut: it's uploaded, or the stage is checked off. */
export function finalCutTurnedIn(row: { finalCut: boolean; finalCutMediaItemId: string | null }): boolean {
  return row.finalCut || row.finalCutMediaItemId !== null;
}

/** The person's package group in the prize cycle (Cycle 2), if they're on one. */
export function prizeRowFor(userId: string) {
  return prisma.packageProgressRow.findFirst({
    where: { cycleNumber: HARVEST_CONTEST.prizeCycle, members: { some: { userId } } },
    select: PRIZE_ROW_SELECT
  });
}

/**
 * A pre-approved extension for the whole group, filed in the winner's name: a group's extension
 * is its longest grant, so this is the longest whole-group grant it has plus the prize days.
 * Returns the grant's id.
 */
export async function createPrizeGrant(
  tx: Prisma.TransactionClient,
  input: { winnerId: string; row: PrizeRow; reason: string; now: Date }
): Promise<string> {
  const { winnerId, row, reason, now } = input;
  const wholeGroupDays = row.extension
    ? row.extensionRequests.filter((grant) => grant.grantedUserIds.length === 0).map((grant) => grant.grantedDays ?? grant.requestedDays)
    : [];
  const days = prizeGrantDays(wholeGroupDays);
  const grant = await tx.packageExtensionRequest.create({
    data: {
      userId: winnerId,
      progressRowId: row.id,
      cycleNumber: row.cycleNumber,
      requestedDays: days,
      grantedDays: days,
      grantedUserIds: [],
      producerGranted: true,
      reason,
      status: "APPROVED",
      decidedAt: now
    }
  });
  await tx.packageProgressRow.update({ where: { id: row.id }, data: { extension: true } });
  return grant.id;
}
