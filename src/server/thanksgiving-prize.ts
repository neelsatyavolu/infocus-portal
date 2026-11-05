import { afterResponse } from "@/src/lib/after-response";
import { prisma } from "@/src/lib/prisma";
import { HARVEST_CONTEST } from "@/src/lib/thanksgiving-board";
import { notifyGroupOfExtensionDecision } from "@/src/server/extension-grant-notify";
import { loadHarvestContest } from "@/src/server/thanksgiving-contest";
import { createPrizeGrant, finalCutTurnedIn, PRIZE_ROW_SELECT } from "@/src/server/thanksgiving-prize-grant";

/**
 * A winner whose own Cycle 2 group had already turned in its Final Cut picks a group still
 * working to get the prize instead (the dialog in components/thanksgiving/prize-choice.tsx, or
 * an exec on /thanksgiving on their behalf).
 */

export type PrizeOption = { id: string; topic: string; members: string[] };
export type PrizeChooser = { userId: string; name: string };

/** Cycle 2 groups that haven't turned in their Final Cut, by topic. */
export async function loadPrizeOptions(): Promise<PrizeOption[]> {
  const rows = await prisma.packageProgressRow.findMany({
    where: { cycleNumber: HARVEST_CONTEST.prizeCycle, finalCut: false, finalCutMediaItemId: null, members: { some: {} } },
    select: {
      id: true,
      groupTopic: true,
      members: { select: { user: { select: { name: true, nickname: true } } } }
    }
  });
  return rows
    .map((row) => ({
      id: row.id,
      topic: row.groupTopic.trim() || "Untitled package",
      members: row.members.map(({ user }) => user.nickname?.trim() || user.name?.trim() || "Someone")
    }))
    .sort((a, b) => a.topic.localeCompare(b.topic));
}

/** Winners still to pick: just the viewer (if it's them), or all of them for an exec. */
export async function loadPrizeChoosers(viewerId: string, admin: boolean): Promise<PrizeChooser[]> {
  const result = await loadHarvestContest();
  if (!result) return [];
  return result.winners
    .filter((winner) => winner.prize.kind === "choosing" && (admin || winner.userId === viewerId))
    .map(({ userId, name }) => ({ userId, name }));
}

/** Gives a winner's prize to the group they picked. Throws a message to show when it can't. */
export async function givePrize(input: { winnerId: string; rowId: string; byUserId: string; admin: boolean; now?: Date }) {
  const { winnerId, rowId, byUserId, admin, now = new Date() } = input;
  if (!admin && byUserId !== winnerId) throw new Error("Only the winner can choose where their prize goes.");
  const choosers = await loadPrizeChoosers(winnerId, true);
  const winner = choosers.find((chooser) => chooser.userId === winnerId);
  if (!winner) throw new Error("This prize has already been given.");

  const grantId = await prisma.$transaction(async (tx) => {
    // One choice at a time, so a double click can't give the prize twice.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"thanksgiving:prize"}))::text`;
    const contest = await tx.thanksgivingContest.findUnique({ where: { year: HARVEST_CONTEST.year }, select: { grantIds: true } });
    const given = await tx.packageExtensionRequest.count({ where: { id: { in: contest?.grantIds ?? [] }, userId: winnerId } });
    if (!contest || given > 0) throw new Error("This prize has already been given.");
    const row = await tx.packageProgressRow.findFirst({
      where: { id: rowId, cycleNumber: HARVEST_CONTEST.prizeCycle, members: { some: {} } },
      select: PRIZE_ROW_SELECT
    });
    if (!row || finalCutTurnedIn(row)) throw new Error("Pick a Cycle 2 group that hasn't turned in its Final Cut.");
    const reason = `Thanksgiving leaderboard prize from ${winner.name}, first on the board at ${HARVEST_CONTEST.closesLabel} (their own group had already turned in its Final Cut). Pre-approved.`;
    const id = await createPrizeGrant(tx, { winnerId, row, reason, now });
    await tx.thanksgivingContest.update({ where: { year: HARVEST_CONTEST.year }, data: { grantIds: [...contest.grantIds, id] } });
    return id;
  });
  afterResponse("notifyGroupOfExtensionDecision", () => notifyGroupOfExtensionDecision(grantId));
  return { grantId };
}
