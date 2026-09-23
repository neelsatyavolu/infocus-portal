import {
  MAX_PORTFOLIO_POINTS,
  hasGradeableWork,
  letterGrade,
  weightedGradePercentage,
  type GradeInput
} from "@/src/lib/grading";
import { applyCycleRequirementQuota, isAssociateProducerRole } from "@/src/lib/package-cycle-requirements";
import { approvedExtensionDaysFor, effectiveDeadline } from "@/src/lib/package-extensions";
import { getPlatformRoleForEmail } from "@/src/lib/platform-admin";
import { unresolvedFinalCutPoints } from "@/src/lib/package-revisions";
import { checkInGradeForProgress, checkInOverrides, cycleCheckInDates } from "@/src/lib/package-stages";
import { prisma } from "@/src/lib/prisma";
import { participationPointsForDate, type ScheduleKind } from "@/src/lib/school-schedule";
import { resolveLivestreamPointsForUser } from "@/src/server/livestream-credit";
import { getCycleNumbers } from "@/src/server/program-settings";

async function loadScheduleOverrides() {
  const rows = await prisma.schoolCalendarDay.findMany({
    select: { date: true, kind: true }
  });
  const map = new Map<string, ScheduleKind>();
  for (const row of rows) {
    map.set(row.date, row.kind as ScheduleKind);
  }
  return map;
}

/**
 * Assembles every input the 2026-27 weighted grade needs for one student:
 * per-cycle final cuts, check-in credit released after each stage deadline,
 * livestream credit (hours → points), weekly participation, and the final portfolio.
 *
 * Pass `livestreamPoints` to override the auto-tracked value (tests / tools).
 * Omit or pass `undefined` to resolve from completed livestream hours.
 */
export async function buildGradeSummary(
  userId: string,
  livestreamPoints?: number | null
) {
  const cycleNumbers = await getCycleNumbers();

  const [grades, rows, participation, portfolio, cycles, scheduleOverrides, resolvedLivestream, role] =
    await Promise.all([
      prisma.packageGrade.findMany({
        where: { userId, cycleNumber: { in: cycleNumbers } }
      }),
      prisma.packageProgressRow.findMany({
        where: {
          cycleNumber: { in: cycleNumbers },
          members: { some: { userId } }
        },
        include: {
          approval: { select: { stage: true } },
          extensionRequests: { where: { status: "APPROVED" }, select: { requestedDays: true, grantedDays: true, grantedUserIds: true } },
          _count: { select: { proofOfContacts: true } },
          stageMedia: { where: { stage: "a-roll" }, select: { id: true } }
        }
      }),
      prisma.participationEntry.findMany({ where: { userId } }),
      prisma.portfolioGrade.findUnique({ where: { userId } }),
      prisma.packageCycle.findMany({
        where: { cycleNumber: { in: cycleNumbers } },
        select: {
          cycleNumber: true,
          pitchingDate: true,
          proofOfContactDate: true,
          aRollBRollDate: true,
          initialCutDate: true,
          finalCutDate: true
        }
      }),
      loadScheduleOverrides(),
      livestreamPoints === undefined ? resolveLivestreamPointsForUser(userId) : Promise.resolve(livestreamPoints),
      prisma.user.findUnique({ where: { id: userId }, select: { email: true } }).then((user) =>
        getPlatformRoleForEmail(user?.email)
      )
    ]);

  const gradeByCycle = new Map(grades.map((grade) => [grade.cycleNumber, grade]));
  const rowByCycle = new Map(rows.map((row) => [row.cycleNumber, row]));
  const cycleByNumber = new Map(cycles.map((cycle) => [cycle.cycleNumber, cycle]));
  const finalCutDateByCycle = new Map(cycles.map((cycle) => [cycle.cycleNumber, cycle.finalCutDate]));

  const now = new Date();
  const associate = isAssociateProducerRole(role);

  const rawFinalCutPoints = cycleNumbers.map((cycleNumber) => {
    const grade = gradeByCycle.get(cycleNumber);
    const row = rowByCycle.get(cycleNumber);
    if (grade?.finalCutState) return null;
    const awarded = grade?.awardedFinalCutPoints ?? null;
    const official = awarded === null ? null : (grade?.finalCutPoints ?? awarded);
    const approvedDays = approvedExtensionDaysFor(row, userId);
    const deadline = effectiveDeadline(finalCutDateByCycle.get(cycleNumber) ?? null, approvedDays);
    const hasValidFinalCut = Boolean(row?.finalCutMediaItemId && row.approval?.stage === "APPROVED");
    const deadlinePassed = Boolean(deadline && now > deadline);

    return unresolvedFinalCutPoints({
      awardedPoints: awarded,
      officialPoints: official,
      deadlinePassed: associate && !row ? false : deadlinePassed,
      hasValidFinalCut
    });
  });

  const checkInGrades = cycleNumbers.map((cycleNumber) => {
    const cycle = cycleByNumber.get(cycleNumber);
    const row = rowByCycle.get(cycleNumber);
    if (associate && !row) {
      return checkInGradeForProgress({ now, dates: {}, row: null });
    }
    return checkInGradeForProgress({
      now,
      dates: cycle ? cycleCheckInDates(cycle) : {},
      overrides: checkInOverrides(gradeByCycle.get(cycleNumber)),
      row: row
        ? {
            pitching: row.pitching,
            proofOfContact: row.proofOfContact,
            aRollBRoll: row.aRollBRoll,
            initialCut: row.initialCut,
            brainstormDocUrl: row.brainstormDocUrl,
            proofOfContactCount: row._count.proofOfContacts,
            hasARollMedia: row.stageMedia.length > 0,
            hasInitialCutMedia: Boolean(row.initialCutMediaItemId)
          }
        : null
    });
  });
  const quota = applyCycleRequirementQuota(
    cycleNumbers.map((cycleNumber, index) => {
      const row = rowByCycle.get(cycleNumber);
      const checkIn = checkInGrades[index]!;
      const deadline = effectiveDeadline(
        finalCutDateByCycle.get(cycleNumber) ?? null,
        approvedExtensionDaysFor(row, userId)
      );
      return {
        cycleNumber,
        isMember: Boolean(row),
        finalCutPoints: rawFinalCutPoints[index] ?? null,
        finalCutExcluded: Boolean(gradeByCycle.get(cycleNumber)?.finalCutState),
        checkInPoints: checkIn.earned,
        checkInPossible: checkIn.earned === null ? null : checkIn.possible,
        finalDeadlinePassed: Boolean(deadline && now > deadline)
      };
    }),
    role
  );
  const finalCutPoints = quota.displayFinalCutPoints;
  const checkInPoints = quota.displayCheckInPoints;
  const checkInPossible = quota.displayCheckInPossible;
  const checkInStages = checkInGrades.map((grade, index) => ({
    cycleNumber: cycleNumbers[index]!,
    ...grade.stages
  }));

  const participationEarned = participation.reduce((total, entry) => {
    const possible = participationPointsForDate(entry.date, scheduleOverrides);
    return possible > 0 ? total + entry.points : total;
  }, 0);
  const participationPossible = participation.reduce(
    (total, entry) => total + participationPointsForDate(entry.date, scheduleOverrides),
    0
  );

  const effectiveLivestream = resolvedLivestream;

  const input: GradeInput = {
    finalCutPoints: quota.countedFinalCutPoints,
    checkInPoints: quota.countedCheckInPoints,
    checkInPossible: quota.countedCheckInPossible,
    livestreamPoints: effectiveLivestream,
    participationEarned,
    participationPossible,
    portfolioPoints: portfolio ? portfolio.points : null
  };

  // A student with nothing gradeable yet has no grade, not a zero.
  const gradeable = hasGradeableWork(input);
  const percentage = gradeable ? weightedGradePercentage(input) : null;

  return {
    cycleNumbers,
    finalCutPoints,
    checkInPoints,
    checkInPossible,
    countedFinalCutPoints: quota.countedFinalCutPoints,
    countedCheckInPoints: quota.countedCheckInPoints,
    countedCheckInPossible: quota.countedCheckInPossible,
    checkInStages,
    livestreamPoints: effectiveLivestream,
    participationEarned,
    participationPossible,
    portfolioPoints: portfolio?.points ?? null,
    maxPortfolioPoints: MAX_PORTFOLIO_POINTS,
    percentage,
    letter: percentage === null ? null : letterGrade(percentage)
  };
}
