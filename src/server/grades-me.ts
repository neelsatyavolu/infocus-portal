import type { PlatformRole } from "@prisma/client";
import { calculateExtensionsRemaining } from "@/src/lib/extensions";
import {
  packageCategoryScore,
  participationCategoryScore,
  portfolioCategoryScore,
  GRADE_WEIGHTS
} from "@/src/lib/grading";
import { PACKAGE_CYCLE_NUMBERS, gradePercentage, gradeTotal } from "@/src/lib/package-grades";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { loadGradebookExtras } from "@/src/server/student-gradebook";
import { buildGradeSummary } from "@/src/server/student-grade-summary";

/**
 * The signed-in student's own grades (`GET /api/grades/me` and the /grades page's first paint).
 * Callers resolve the user and platform role first, exactly as the route does.
 */

function parseCycleNumberFromProjectName(projectName: string) {
  const match = projectName.match(/package\s+cycle\s+(\d+)/i);
  if (!match) {
    return null;
  }

  const cycleNumber = Number(match[1]);
  if (!Number.isInteger(cycleNumber) || !PACKAGE_CYCLE_NUMBERS.includes(cycleNumber as (typeof PACKAGE_CYCLE_NUMBERS)[number])) {
    return null;
  }

  return cycleNumber;
}

function isFinalCutFolder(folderName: string | null) {
  if (folderName === null) {
    return true;
  }

  return folderName.trim().toLowerCase() === "final cut";
}

function shouldReplaceReviewTarget(
  current:
    | {
        finalCutPreferred: boolean;
        updatedAtMs: number;
      }
    | undefined,
  next: {
    finalCutPreferred: boolean;
    updatedAtMs: number;
  }
) {
  if (!current) {
    return true;
  }

  if (next.finalCutPreferred !== current.finalCutPreferred) {
    return next.finalCutPreferred;
  }

  return next.updatedAtMs > current.updatedAtMs;
}

/** Cycle numbers the tiles expect but that have no PackageCycle row yet. */
function missingDefaultCycles(cycles: Array<{ cycleNumber: number }>) {
  const existingSet = new Set(cycles.map((entry) => entry.cycleNumber));
  return PACKAGE_CYCLE_NUMBERS.filter((cycleNumber) => !existingSet.has(cycleNumber));
}

/**
 * Everything the page reads, in one wave. The gradebook extras use cycle numbers and check-ins
 * only for `checkIns`, which loadMyGrades fills from the summary, so they don't wait for it.
 */
function loadGradeSources(userId: string, role: PlatformRole | null) {
  return Promise.all([
    prisma.packageCycle.findMany({
      orderBy: { cycleNumber: "asc" },
      select: {
        cycleNumber: true,
        focus: true
      }
    }),
    prisma.packageGrade.findMany({
      where: { userId },
      select: {
        cycleNumber: true,
        effortPoints: true,
        finalCutState: true,
        teamworkPoints: true,
        previousEffortPoints: true,
        previousTeamworkPoints: true,
        revisedAt: true,
        feedback: true,
        publishedAt: true,
        extensionDaysApplied: true,
        freeExtensionDays: true,
        extensionExempt: true
      }
    }),
    prisma.mediaItem.findMany({
      where: {
        deletedAt: null,
        memberAssignments: {
          some: {
            userId
          }
        }
      },
      select: {
        id: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            name: true
          }
        },
        folder: {
          select: {
            name: true
          }
        }
      }
    }),
    // Weighted 2026–27 grade (packages / participation / portfolio).
    // Livestream credit is derived from completed hours on the livestream tracker.
    // The caller already resolved this user's role, so the summary skips re-reading it.
    buildGradeSummary(userId, undefined, { platformRole: role }),
    loadGradebookExtras(userId, [], [])
  ]);
}

export async function loadMyGrades(userId: string, role: PlatformRole | null) {
  const isAdmin = hasPlatformRole(role, "EXECUTIVE_PRODUCER");

  // The cycle list doubles as the default-cycles check: in the rare case a default cycle is
  // missing, create it and load again, so nothing reads a half-made set of cycles.
  let sources = await loadGradeSources(userId, role);
  const missing = missingDefaultCycles(sources[0]);
  if (missing.length > 0) {
    await prisma.packageCycle.createMany({
      data: missing.map((cycleNumber) => ({
        cycleNumber,
        focus: ""
      }))
    });
    sources = await loadGradeSources(userId, role);
  }
  const [cycles, myGrades, assignedMediaItems, gradeSummary, extras] = sources;
  const gradebook = { ...extras, checkIns: gradeSummary.checkInStages };

  const myGradeMap = new Map(myGrades.map((entry) => [entry.cycleNumber, entry]));
  const reviewTargetByCycle = new Map<
    number,
    {
      projectId: string;
      mediaId: string;
      finalCutPreferred: boolean;
      updatedAtMs: number;
    }
  >();

  for (const mediaItem of assignedMediaItems) {
    const cycleNumber = parseCycleNumberFromProjectName(mediaItem.project.name);
    if (!cycleNumber) {
      continue;
    }

    const candidate = {
      projectId: mediaItem.project.id,
      mediaId: mediaItem.id,
      finalCutPreferred: isFinalCutFolder(mediaItem.folder?.name ?? null),
      updatedAtMs: mediaItem.updatedAt.getTime()
    };
    const current = reviewTargetByCycle.get(cycleNumber);

    if (shouldReplaceReviewTarget(current, candidate)) {
      reviewTargetByCycle.set(cycleNumber, candidate);
    }
  }

  const myPublishedTotals: number[] = [];

  const cycleTiles = cycles.map((cycle) => {
    const raw = myGradeMap.get(cycle.cycleNumber);
    const published = Boolean(raw?.publishedAt) && !isAdmin;
    const totalPoints = published && raw && !raw.finalCutState ? gradeTotal(raw.effortPoints, raw.teamworkPoints) : null;
    const reviewTarget = reviewTargetByCycle.get(cycle.cycleNumber);

    if (totalPoints !== null) {
      myPublishedTotals.push(totalPoints);
    }

    return {
      cycleNumber: cycle.cycleNumber,
      focus: cycle.focus,
      published,
      effortPoints: published && raw && !raw.finalCutState ? raw.effortPoints : null,
      teamworkPoints: published && raw && !raw.finalCutState ? raw.teamworkPoints : null,
      previousEffortPoints: published && raw ? raw.previousEffortPoints : null,
      previousTeamworkPoints: published && raw ? raw.previousTeamworkPoints : null,
      totalPoints,
      percentage: totalPoints === null ? null : gradePercentage(totalPoints),
      revised: published && raw ? Boolean(raw.revisedAt) : false,
      revisedAt: published && raw?.revisedAt ? raw.revisedAt.toISOString() : null,
      feedback: published && raw ? raw.feedback : null,
      reviewProjectId: reviewTarget?.projectId ?? null,
      reviewMediaId: reviewTarget?.mediaId ?? null
    };
  });

  const myAverageTotal =
    myPublishedTotals.length > 0
      ? Number((myPublishedTotals.reduce((sum, value) => sum + value, 0) / myPublishedTotals.length).toFixed(1))
      : null;

  const gradeInput = {
    finalCutPoints: gradeSummary.countedFinalCutPoints,
    checkInPoints: gradeSummary.countedCheckInPoints,
    checkInPossible: gradeSummary.countedCheckInPossible,
    livestreamPoints: gradeSummary.livestreamPoints,
    participationEarned: gradeSummary.participationEarned,
    participationPossible: gradeSummary.participationPossible,
    portfolioPoints: gradeSummary.portfolioPoints
  };

  const packages = packageCategoryScore(gradeInput);
  const participation = participationCategoryScore(gradeInput);
  const portfolio = portfolioCategoryScore(gradeInput);

  return {
    role,
    isAdmin,
    summary: {
      publishedCycleCount: myPublishedTotals.length,
      averageTotal: myAverageTotal,
      averagePercentage: myAverageTotal === null ? null : gradePercentage(myAverageTotal),
      extensionsRemaining: isAdmin ? null : calculateExtensionsRemaining(myGrades)
    },
    estimated: {
      percentage: gradeSummary.percentage,
      letter: gradeSummary.letter,
      weights: GRADE_WEIGHTS,
      packages: {
        earned: packages.earned,
        possible: packages.possible,
        finalCutPoints: gradeSummary.finalCutPoints,
        checkInPoints: gradeSummary.checkInPoints,
        checkInPossible: gradeSummary.checkInPossible,
        livestreamPoints: gradeSummary.livestreamPoints
      },
      participation: {
        earned: participation.earned,
        possible: participation.possible
      },
      portfolio: {
        earned: portfolio.earned,
        possible: portfolio.possible,
        points: gradeSummary.portfolioPoints,
        max: gradeSummary.maxPortfolioPoints
      }
    },
    cycles: cycleTiles,
    gradebook
  };
}
