import type { PlatformRole } from "@prisma/client";
import { finalCutHeadline } from "@/src/lib/package-headline";
import { canGradeFinalCut } from "@/src/lib/package-final-cut-scores";
import { packageOfCycleUnanimous, packageOfCycleVoteBlocked } from "@/src/lib/package-of-cycle";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { loadRequiredFinalCutGraders } from "@/src/server/package-progress-data";

/** Winners are shown to the whole class, so never fall back to an email address. */
function memberName(user: { name: string | null; nickname: string | null }) {
  return user.nickname?.trim() || user.name?.trim() || "Member";
}

export type PackageOfCyclePanel = {
  canVote: boolean;
  myVote: boolean;
  awardedAt: string | null;
  blockedReason: string | null;
  graders: Array<{ userId: string; name: string; voted: boolean }>;
};

async function otherWinnerCount(cycleNumber: number, rowId: string) {
  return prisma.packageProgressRow.count({
    where: { cycleNumber, id: { not: rowId }, packageOfCycleAt: { not: null } }
  });
}

export async function loadPackageOfCyclePanel(input: {
  rowId: string;
  userId: string;
  role: PlatformRole | null;
}): Promise<PackageOfCyclePanel> {
  const [row, graders, votes] = await Promise.all([
    prisma.packageProgressRow.findUniqueOrThrow({
      where: { id: input.rowId },
      select: { cycleNumber: true, finalCutMediaItemId: true, packageOfCycleAt: true }
    }),
    loadRequiredFinalCutGraders(),
    prisma.packageOfCycleVote.findMany({ where: { rowId: input.rowId }, select: { voterUserId: true } })
  ]);
  const voterIds = new Set(votes.map((vote) => vote.voterUserId));
  return {
    canVote: canGradeFinalCut(input.role),
    myVote: voterIds.has(input.userId),
    awardedAt: row.packageOfCycleAt?.toISOString() ?? null,
    blockedReason: packageOfCycleVoteBlocked({
      hasFinalCut: Boolean(row.finalCutMediaItemId),
      alreadyWon: Boolean(row.packageOfCycleAt),
      otherWinnersInCycle: await otherWinnerCount(row.cycleNumber, input.rowId)
    }),
    graders: graders.map((grader) => ({
      userId: grader.userId,
      name: grader.name || grader.email || "Executive producer",
      voted: voterIds.has(grader.userId)
    }))
  };
}

/**
 * Records one grader's vote. The package wins once every required Final Cut grader
 * has voted, and loses the award if any of them withdraws.
 */
export async function setPackageOfCycleVote(input: {
  rowId: string;
  userId: string;
  role: PlatformRole | null;
  vote: boolean;
}) {
  if (!canGradeFinalCut(input.role)) throw new Error("FORBIDDEN");
  const graderIds = (await loadRequiredFinalCutGraders()).map((grader) => grader.userId);

  await prisma.$transaction(async (tx) => {
    // One vote at a time, so the unanimity check and the per-cycle cap can't race.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('package-of-cycle'))`;
    const row = await tx.packageProgressRow.findUnique({
      where: { id: input.rowId },
      select: { cycleNumber: true, finalCutMediaItemId: true, packageOfCycleAt: true }
    });
    if (!row) throw new Error("NOT_FOUND");

    if (input.vote) {
      const blocked = packageOfCycleVoteBlocked({
        hasFinalCut: Boolean(row.finalCutMediaItemId),
        alreadyWon: Boolean(row.packageOfCycleAt),
        otherWinnersInCycle: await tx.packageProgressRow.count({
          where: { cycleNumber: row.cycleNumber, id: { not: input.rowId }, packageOfCycleAt: { not: null } }
        })
      });
      // handleRouteError returns this message to the grader as a 400.
      if (blocked) throw new Error(blocked);
      await tx.packageOfCycleVote.upsert({
        where: { rowId_voterUserId: { rowId: input.rowId, voterUserId: input.userId } },
        create: { rowId: input.rowId, voterUserId: input.userId },
        update: {}
      });
    } else {
      await tx.packageOfCycleVote.deleteMany({ where: { rowId: input.rowId, voterUserId: input.userId } });
    }

    const voters = await tx.packageOfCycleVote.findMany({
      where: { rowId: input.rowId },
      select: { voterUserId: true }
    });
    const won = packageOfCycleUnanimous(
      graderIds,
      voters.map((voter) => voter.voterUserId)
    );
    if (won !== Boolean(row.packageOfCycleAt)) {
      await tx.packageProgressRow.update({
        where: { id: input.rowId },
        data: { packageOfCycleAt: won ? new Date() : null }
      });
    }
  });
}

export type PackageOfCycleWinner = {
  rowId: string;
  cycleNumber: number;
  topic: string;
  headline: string | null;
  awardedAt: string;
  members: Array<{ userId: string; name: string }>;
};

/** Every winner, newest cycle first, for the Package Cycles page (everyone). */
export async function loadPackageOfCycleWinners(): Promise<PackageOfCycleWinner[]> {
  const rows = await prisma.packageProgressRow.findMany({
    where: { packageOfCycleAt: { not: null } },
    orderBy: [{ cycleNumber: "desc" }, { packageOfCycleAt: "asc" }],
    select: {
      id: true,
      cycleNumber: true,
      groupTopic: true,
      packageOfCycleAt: true,
      finalCutMediaItem: { select: { title: true, currentVersion: { select: { nasPath: true } } } },
      members: {
        orderBy: { createdAt: "asc" },
        select: { userId: true, user: { select: { name: true, nickname: true, email: true } } }
      }
    }
  });
  return rows.map((row) => ({
    rowId: row.id,
    cycleNumber: row.cycleNumber,
    topic: row.groupTopic.trim(),
    headline: finalCutHeadline(row.finalCutMediaItem),
    awardedAt: row.packageOfCycleAt!.toISOString(),
    members: row.members.map((member) => ({ userId: member.userId, name: memberName(member.user) }))
  }));
}

export type CertificateData = {
  name: string;
  cycleNumber: number;
  title: string;
  awardedAt: Date;
};

/** Certificate details for one winning member. Members get their own; producers get any. */
export async function loadCertificateData(input: {
  rowId: string;
  memberUserId: string;
  viewerUserId: string;
  role: PlatformRole | null;
}): Promise<CertificateData> {
  const isProducer = hasPlatformRole(input.role, "ASSOCIATE_PRODUCER");
  if (!isProducer && input.viewerUserId !== input.memberUserId) throw new Error("FORBIDDEN");

  const row = await prisma.packageProgressRow.findUnique({
    where: { id: input.rowId },
    select: {
      cycleNumber: true,
      groupTopic: true,
      packageOfCycleAt: true,
      finalCutMediaItem: { select: { title: true, currentVersion: { select: { nasPath: true } } } },
      members: {
        where: { userId: input.memberUserId },
        select: { user: { select: { name: true, nickname: true, email: true } } }
      }
    }
  });
  const member = row?.members[0];
  if (!row?.packageOfCycleAt || !member) throw new Error("NOT_FOUND");

  return {
    // A certificate is formal, so it prints the full name rather than the nickname.
    name: member.user.name?.trim() || memberName(member.user),
    cycleNumber: row.cycleNumber,
    title: finalCutHeadline(row.finalCutMediaItem) ?? (row.groupTopic.trim() || "Untitled package"),
    awardedAt: row.packageOfCycleAt
  };
}
