import type { PlatformRole } from "@prisma/client";
import {
  approvedExtensionDaysFor,
  calculateLatePenalty,
  effectiveDeadline,
  isLatePenaltyOverridePercent,
  memberLatePenaltyMultiplier
} from "@/src/lib/package-extensions";
import { isExecutiveProducer } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { officialFinalCutPoints } from "@/src/lib/package-review-mail";

/**
 * Sets (or clears, with null) an exec's late penalty override for one member, then
 * recomputes that member's official Final Cut points if they are already graded.
 */
export async function setFinalCutLatePenalty(input: {
  rowId: string;
  memberUserId: string;
  percent: number | null;
  role: PlatformRole | null;
}) {
  if (!isExecutiveProducer(input.role)) {
    throw new Error("FORBIDDEN");
  }
  if (input.percent !== null && !isLatePenaltyOverridePercent(input.percent)) {
    throw new Error("BAD_REQUEST");
  }

  const member = await prisma.packageProgressMember.findUnique({
    where: { rowId_userId: { rowId: input.rowId, userId: input.memberUserId } },
    select: {
      id: true,
      row: {
        select: {
          cycleNumber: true,
          extension: true,
          extensionRequests: { where: { status: "APPROVED" }, select: { requestedDays: true, grantedDays: true, grantedUserIds: true } }
        }
      }
    }
  });
  if (!member) {
    throw new Error("NOT_FOUND");
  }

  await prisma.packageProgressMember.update({
    where: { id: member.id },
    data: { latePenaltyPercent: input.percent }
  });

  const grade = await prisma.packageGrade.findUnique({
    where: { cycleNumber_userId: { cycleNumber: member.row.cycleNumber, userId: input.memberUserId } },
    select: { id: true, awardedFinalCutPoints: true, turnedInDate: true }
  });
  if (grade?.awardedFinalCutPoints == null) {
    return { regraded: false };
  }

  const cycle = await prisma.packageCycle.findUnique({
    where: { cycleNumber: member.row.cycleNumber },
    select: { finalCutDate: true }
  });
  const deadline = effectiveDeadline(
    cycle?.finalCutDate ?? null,
    approvedExtensionDaysFor(member.row, input.memberUserId)
  );
  const multiplier = memberLatePenaltyMultiplier(calculateLatePenalty(deadline, grade.turnedInDate), input.percent);
  await prisma.packageGrade.update({
    where: { id: grade.id },
    data: { finalCutPoints: officialFinalCutPoints(grade.awardedFinalCutPoints, multiplier) }
  });
  return { regraded: true };
}
