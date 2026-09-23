import { REQUIRED_LIVESTREAM_HOURS, semesterForDate } from "@/src/lib/livestream";
import { buildParticipationWeeks, type GradebookCheckIn, type GradebookWeek } from "@/src/lib/student-gradebook";
import { prisma } from "@/src/lib/prisma";
import { completedLivestreamHoursForUser } from "@/src/server/livestream-credit";
import type { ScheduleKind } from "@/src/lib/school-schedule";

export type StudentGradebookExtras = {
  semester: {
    label: string;
    start: string;
    end: string;
  };
  weeks: GradebookWeek[];
  livestreamHours: number;
  requiredLivestreamHours: number;
  portfolioFeedback: string;
  checkIns: GradebookCheckIn[];
};

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

export async function loadGradebookExtras(
  userId: string,
  cycleNumbers: number[],
  checkIns?: GradebookCheckIn[]
): Promise<StudentGradebookExtras> {
  const semester = semesterForDate();

  const [participation, portfolio, livestreamHours, overrides] = await Promise.all([
    prisma.participationEntry.findMany({
      where: {
        userId,
        date: { gte: semester.start, lte: semester.end }
      },
      select: { date: true, points: true, notes: true }
    }),
    prisma.portfolioGrade.findUnique({
      where: { userId },
      select: { feedback: true }
    }),
    completedLivestreamHoursForUser(userId, semester),
    loadScheduleOverrides()
  ]);

  return {
    semester: {
      label: semester.label,
      start: semester.start.toISOString(),
      end: semester.end.toISOString()
    },
    weeks: buildParticipationWeeks({
      semesterStart: semester.start,
      semesterEnd: semester.end,
      entries: participation,
      overrides
    }),
    livestreamHours,
    requiredLivestreamHours: REQUIRED_LIVESTREAM_HOURS,
    portfolioFeedback: portfolio?.feedback ?? "",
    checkIns:
      checkIns ??
      cycleNumbers.map((cycleNumber) => ({
        cycleNumber,
        pitching: false,
        proofOfContact: false,
        aRollBRoll: false,
        initialCut: false
      }))
  };
}
