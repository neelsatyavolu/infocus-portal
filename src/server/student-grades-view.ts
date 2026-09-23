import {
  GRADE_WEIGHTS,
  packageCategoryScore,
  participationCategoryScore,
  portfolioCategoryScore
} from "@/src/lib/grading";
import { cycleSemesterTerm } from "@/src/lib/package-grades";
import { prisma } from "@/src/lib/prisma";
import { semesterForDate } from "@/src/lib/livestream";
import { loadGradebookExtras } from "@/src/server/student-gradebook";
import { buildGradeSummary } from "@/src/server/student-grade-summary";

export async function loadStudentGradebookView(userId: string) {
  const gradeSummary = await buildGradeSummary(userId);
  const semester = semesterForDate();
  const [cycles, gradebook] = await Promise.all([
    prisma.packageCycle.findMany({
      orderBy: { cycleNumber: "asc" },
      select: { cycleNumber: true, focus: true }
    }),
    loadGradebookExtras(userId, gradeSummary.cycleNumbers, gradeSummary.checkInStages)
  ]);
  const semesterCycles = cycles.filter((cycle) => cycleSemesterTerm(cycle.cycleNumber) === semester.term);

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
    estimated: {
      percentage: gradeSummary.percentage,
      letter: gradeSummary.letter,
      weights: GRADE_WEIGHTS,
      packages: {
        earned: packages.earned,
        possible: packages.possible,
        finalCutPoints: semesterCycles.map((cycle) => {
          const index = gradeSummary.cycleNumbers.indexOf(cycle.cycleNumber);
          return index >= 0 ? gradeSummary.finalCutPoints[index] : null;
        }),
        checkInPoints: semesterCycles.map((cycle) => {
          const index = gradeSummary.cycleNumbers.indexOf(cycle.cycleNumber);
          return index >= 0 ? gradeSummary.checkInPoints[index] : null;
        }),
        checkInPossible: semesterCycles.map((cycle) => {
          const index = gradeSummary.cycleNumbers.indexOf(cycle.cycleNumber);
          return index >= 0 ? gradeSummary.checkInPossible[index] : null;
        }),
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
    cycles: semesterCycles,
    gradebook
  };
}
