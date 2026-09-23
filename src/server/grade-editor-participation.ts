import { semesterForDate } from "@/src/lib/livestream";
import { prisma } from "@/src/lib/prisma";
import type { ScheduleKind } from "@/src/lib/school-schedule";
import { completedParticipationTotals } from "@/src/lib/student-gradebook";

export async function loadGradeEditorParticipation(userIds: string[], now = new Date()) {
  const semester = semesterForDate(now);
  const [entries, calendar] = await Promise.all([
    prisma.participationEntry.findMany({
      where: { userId: { in: userIds }, date: { gte: semester.start, lte: semester.end } },
      select: { userId: true, date: true, points: true }
    }),
    prisma.schoolCalendarDay.findMany({ select: { date: true, kind: true } })
  ]);
  const byUser = new Map<string, Array<{ date: Date; points: number }>>();
  for (const entry of entries) {
    const days = byUser.get(entry.userId) ?? [];
    days.push(entry);
    byUser.set(entry.userId, days);
  }
  const overrides = new Map(calendar.map((day) => [day.date, day.kind as ScheduleKind]));
  return new Map(userIds.map((userId) => [userId, completedParticipationTotals({
    semesterStart: semester.start,
    semesterEnd: semester.end,
    entries: byUser.get(userId) ?? [],
    overrides,
    now
  })]));
}
