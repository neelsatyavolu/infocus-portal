import type { PlatformRole } from "@prisma/client";
import { semesterForDate } from "@/src/lib/livestream";
import {
  applyCycleRequirementQuota,
  isAssociateProducerRole,
  semesterCheckInMax
} from "@/src/lib/package-cycle-requirements";
import { cycleSemesterTerm } from "@/src/lib/package-grades";
import { PLATFORM_SUPER_ADMIN_EMAIL, normalizeEmail } from "@/src/lib/platform-admin";
import {
  CHECK_IN_STATE_SELECT,
  CHECK_IN_STAGES,
  POINTS_PER_CHECK_IN,
  checkInGradeForProgress,
  checkInOverrides,
  releasedCheckInScores,
  type CheckInScores,
  cycleCheckInDates,
  padCheckInsToSemesterMax,
  sumReleasedCheckIns,
  type CheckInProgressSnapshot
} from "@/src/lib/package-stages";
import { prisma } from "@/src/lib/prisma";
import { completedLivestreamHoursByUserIds, resolveLivestreamPointsByUserIds } from "@/src/server/livestream-credit";

export type GradeEditorCycleDates = {
  cycleNumber: number;
  pitchingDate: Date | null;
  proofOfContactDate: Date | null;
  aRollBRollDate: Date | null;
  initialCutDate: Date | null;
  finalCutDate?: Date | null;
};

export type GradeEditorCredits = {
  checkInScoresByCycle: Record<number, CheckInScores>;
  checkInPoints: number | null;
  checkInPossible: number | null;
  livestreamPoints: number | null;
  livestreamHours: number;
  portfolioPoints: number | null;
};

export async function loadGradeEditorCredits(input: {
  userIds: string[];
  cycles: GradeEditorCycleDates[];
  now?: Date;
}): Promise<{
  checkInPossible: number;
  byUserId: Map<string, GradeEditorCredits>;
}> {
  const now = input.now ?? new Date();
  const cycleNumbers = input.cycles.map((cycle) => cycle.cycleNumber);
  const term = semesterForDate(now).term;
  const termCycleCount = input.cycles.filter((cycle) => cycleSemesterTerm(cycle.cycleNumber) === term).length;
  const reporterMax = semesterCheckInMax(null, term, termCycleCount);

  const emptyCredits = (): GradeEditorCredits => ({
    checkInScoresByCycle: {},
    checkInPoints: null,
    checkInPossible: null,
    livestreamPoints: null,
    livestreamHours: 0,
    portfolioPoints: null
  });

  const byUserId = new Map<string, GradeEditorCredits>();
  for (const userId of input.userIds) {
    byUserId.set(userId, emptyCredits());
  }

  if (input.userIds.length === 0) {
    return { checkInPossible: reporterMax, byUserId };
  }

  const [rows, portfolios, livestreamByUser, users, grades, livestreamHoursByUser] = await Promise.all([
    cycleNumbers.length === 0
      ? Promise.resolve([])
      : prisma.packageProgressRow.findMany({
          where: {
            cycleNumber: { in: cycleNumbers },
            members: { some: { userId: { in: input.userIds } } }
          },
          select: {
            cycleNumber: true,
            pitching: true,
            proofOfContact: true,
            aRollBRoll: true,
            initialCut: true,
            brainstormDocUrl: true,
            initialCutMediaItemId: true,
            _count: { select: { proofOfContacts: true } },
            stageMedia: { where: { stage: "a-roll" }, select: { id: true } },
            members: {
              where: { userId: { in: input.userIds } },
              select: { userId: true }
            }
          }
        }),
    prisma.portfolioGrade.findMany({
      where: { userId: { in: input.userIds } },
      select: { userId: true, points: true }
    }),
    resolveLivestreamPointsByUserIds(input.userIds, now),
    prisma.user.findMany({
      where: { id: { in: input.userIds } },
      select: { id: true, email: true }
    }),
    prisma.packageGrade.findMany({
      where: { userId: { in: input.userIds }, cycleNumber: { in: cycleNumbers } },
      select: { ...CHECK_IN_STATE_SELECT, userId: true, cycleNumber: true, pitchingPoints: true, proofOfContactPoints: true, aRollBRollPoints: true, initialCutPoints: true }
    }),
    completedLivestreamHoursByUserIds(input.userIds, semesterForDate(now))
  ]);

  const emails = users.map((user) => normalizeEmail(user.email)).filter(Boolean);
  const assignments =
    emails.length === 0
      ? []
      : await prisma.platformRoleAssignment.findMany({
          where: { email: { in: emails, mode: "insensitive" } },
          select: { email: true, role: true }
        });
  const roleByEmail = new Map(
    assignments.map((entry) => [normalizeEmail(entry.email), entry.role] as const)
  );
  const roleByUserId = new Map<string, PlatformRole | null>();
  for (const user of users) {
    const email = normalizeEmail(user.email);
    roleByUserId.set(
      user.id,
      email && email === PLATFORM_SUPER_ADMIN_EMAIL ? "SUPER_ADMIN" : (roleByEmail.get(email) ?? null)
    );
  }

  const snapshotByUserCycle = new Map<string, CheckInProgressSnapshot>();
  for (const row of rows) {
    const snapshot: CheckInProgressSnapshot = {
      pitching: row.pitching,
      proofOfContact: row.proofOfContact,
      aRollBRoll: row.aRollBRoll,
      initialCut: row.initialCut,
      brainstormDocUrl: row.brainstormDocUrl,
      proofOfContactCount: row._count.proofOfContacts,
      hasARollMedia: row.stageMedia.length > 0,
      hasInitialCutMedia: Boolean(row.initialCutMediaItemId)
    };
    for (const member of row.members) {
      snapshotByUserCycle.set(`${member.userId}:${row.cycleNumber}`, snapshot);
    }
  }

  const gradeByUserCycle = new Map(grades.map((grade) => [`${grade.userId}:${grade.cycleNumber}`, grade]));
  for (const userId of input.userIds) {
    const credits = byUserId.get(userId) ?? emptyCredits();
    const role = roleByUserId.get(userId) ?? null;
    const associate = isAssociateProducerRole(role);
    const perCycle = input.cycles.map((cycle) => {
      const row = snapshotByUserCycle.get(`${userId}:${cycle.cycleNumber}`) ?? null;
      const overrides = checkInOverrides(gradeByUserCycle.get(`${userId}:${cycle.cycleNumber}`));
      const dates = associate && !row ? {} : cycleCheckInDates(cycle);
      const grade =
        associate && !row
          ? checkInGradeForProgress({ now, dates: {}, row: null })
          : checkInGradeForProgress({
              now,
              dates: cycleCheckInDates(cycle),
              row,
              overrides
            });
      credits.checkInScoresByCycle[cycle.cycleNumber] = releasedCheckInScores(grade, dates, now, overrides);
      return {
        cycleNumber: cycle.cycleNumber,
        isMember: Boolean(row),
        finalCutPoints: null as number | null,
        checkInPoints: grade.earned,
        checkInPossible: grade.earned === null ? null : grade.possible,
        finalDeadlinePassed: Boolean(cycle.finalCutDate && cycle.finalCutDate.getTime() <= now.getTime())
      };
    });
    const quota = applyCycleRequirementQuota(perCycle, role);
    const counted = sumReleasedCheckIns(
      quota.countedCheckInPoints.map((earned, index) => ({
        earned,
        possible: quota.countedCheckInPossible[index] ?? 0,
        stages: {
          pitching: false,
          proofOfContact: false,
          aRollBRoll: false,
          initialCut: false
        }
      }))
    );
    const excludedPossible = perCycle.reduce((total, cycle, index) => {
      if (cycleSemesterTerm(cycle.cycleNumber) !== term) return total;
      if (!quota.countedCycles[index]) return total;
      const scores = credits.checkInScoresByCycle[cycle.cycleNumber]!;
      return total + CHECK_IN_STAGES.filter((stage) => typeof scores[stage] === "string").length * POINTS_PER_CHECK_IN;
    }, 0);
    const padded = padCheckInsToSemesterMax({
      releasedEarned: counted.earned,
      releasedPossible: counted.possible,
      semesterMax: Math.max(0, semesterCheckInMax(role, term, termCycleCount) - excludedPossible)
    });
    credits.checkInPoints = padded.earned;
    credits.checkInPossible = padded.possible;
    credits.livestreamPoints = livestreamByUser.get(userId) ?? null;
    credits.livestreamHours = livestreamHoursByUser.get(userId) ?? 0;
    byUserId.set(userId, credits);
  }

  for (const portfolio of portfolios) {
    const credits = byUserId.get(portfolio.userId);
    if (credits) {
      credits.portfolioPoints = portfolio.points;
    }
  }

  return { checkInPossible: reporterMax, byUserId };
}
