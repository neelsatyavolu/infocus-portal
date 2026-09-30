import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { recomputeCycleCutStatus } from "@/src/server/cycle-cut-status";

type CutFlags = {
  initialCut: boolean;
  finalCut: boolean;
  initialCutManual: boolean;
  finalCutManual: boolean;
};

/**
 * Cuts already uploaded stay in the old cycle's Drive project, which the new
 * cycle's auto check does not scan. Pin finished cuts so the move keeps them.
 */
export function carriedCutFlags(row: CutFlags) {
  return {
    initialCutManual: row.initialCutManual || row.initialCut,
    finalCutManual: row.finalCutManual || row.finalCut
  };
}

export type MovePackageRowResult =
  | { moved: true; fromCycleNumber: number; toCycleNumber: number }
  | { moved: false; conflictNames: string[] };

/**
 * Moves a package group to another cycle. The row keeps its id, so members,
 * uploads, comments, approval, chats and extension requests stay attached.
 * Refuses when a member is already in a group in the target cycle.
 */
export async function movePackageRow(rowId: string, toCycleNumber: number): Promise<MovePackageRowResult> {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: rowId },
    select: {
      id: true,
      cycleNumber: true,
      initialCut: true,
      finalCut: true,
      initialCutManual: true,
      finalCutManual: true,
      members: { select: { userId: true } }
    }
  });
  if (!row) throw new Error("NOT_FOUND");
  if (row.cycleNumber === toCycleNumber) throw new Error("BAD_REQUEST");

  const memberIds = row.members.map((member) => member.userId);
  const conflicts =
    memberIds.length === 0
      ? []
      : await prisma.packageProgressMember.findMany({
          where: { userId: { in: memberIds }, row: { cycleNumber: toCycleNumber } },
          select: { user: { select: { name: true, nickname: true, email: true } } }
        });
  if (conflicts.length > 0) {
    const names = conflicts.map(({ user }) => userDisplayName(user, "A member"));
    return { moved: false, conflictNames: [...new Set(names)] };
  }

  const last = await prisma.packageProgressRow.aggregate({
    where: { cycleNumber: toCycleNumber },
    _max: { rowOrder: true }
  });

  await prisma.$transaction([
    prisma.packageProgressRow.update({
      where: { id: row.id },
      data: {
        cycleNumber: toCycleNumber,
        rowOrder: (last._max.rowOrder ?? -1) + 1,
        ...carriedCutFlags(row)
      }
    }),
    prisma.packageExtensionRequest.updateMany({
      where: { progressRowId: row.id },
      data: { cycleNumber: toCycleNumber }
    })
  ]);

  await recomputeCycleCutStatus(toCycleNumber);

  return { moved: true, fromCycleNumber: row.cycleNumber, toCycleNumber };
}
