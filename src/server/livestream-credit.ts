import {
  isDateInSemester,
  livestreamAttendeeHours,
  livestreamGradesReleased,
  livestreamPointsFromHours,
  semesterForDate,
  type AcademicSemester
} from "@/src/lib/livestream";
import { prisma } from "@/src/lib/prisma";

/**
 * Sum COMPLETED-event hours for a user within a semester (attendee rows only).
 */
export async function completedLivestreamHoursForUser(
  userId: string,
  semester: AcademicSemester = semesterForDate()
) {
  const attendances = await prisma.livestreamAttendee.findMany({
    where: {
      userId,
      event: {
        status: "COMPLETED",
        startsAt: { gte: semester.start, lte: semester.end }
      }
    },
    select: {
      creditHours: true,
      event: { select: { hours: true, startsAt: true } }
    }
  });

  return attendances.reduce((total, row) => {
    if (!isDateInSemester(row.event.startsAt, semester)) {
      return total;
    }
    return total + livestreamAttendeeHours(row.event.hours, row.creditHours);
  }, 0);
}

/**
 * Livestream points for the weighted grade. Null until release and at least one COMPLETED
 * livestream exists in the semester (so an empty tracker is not a silent 0%).
 * Once tracking has started, hours scale to MAX_LIVESTREAM_POINTS (8h = 40 pts).
 */
export async function resolveLivestreamPointsForUser(
  userId: string,
  at: Date = new Date()
): Promise<number | null> {
  const semester = semesterForDate(at);
  if (!livestreamGradesReleased(at, semester)) {
    return null;
  }

  const completedCount = await prisma.livestreamEvent.count({
    where: {
      status: "COMPLETED",
      startsAt: { gte: semester.start, lte: semester.end }
    }
  });
  if (completedCount === 0) {
    return null;
  }

  const hours = await completedLivestreamHoursForUser(userId, semester);
  return livestreamPointsFromHours(hours);
}

/** Same rules as resolveLivestreamPointsForUser, batched for a roster. */
export async function resolveLivestreamPointsByUserIds(
  userIds: string[],
  at: Date = new Date()
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  for (const userId of userIds) {
    result.set(userId, null);
  }
  if (userIds.length === 0) {
    return result;
  }

  const semester = semesterForDate(at);
  if (!livestreamGradesReleased(at, semester)) {
    return result;
  }

  const completedCount = await prisma.livestreamEvent.count({
    where: {
      status: "COMPLETED",
      startsAt: { gte: semester.start, lte: semester.end }
    }
  });
  if (completedCount === 0) {
    return result;
  }

  const hoursByUser = await completedLivestreamHoursByUserIds(userIds, semester);
  for (const userId of userIds) {
    result.set(userId, livestreamPointsFromHours(hoursByUser.get(userId) ?? 0));
  }
  return result;
}

/** Completed hours remain visible even while grades are unreleased. */
export async function completedLivestreamHoursByUserIds(
  userIds: string[],
  semester: AcademicSemester = semesterForDate()
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const attendances = await prisma.livestreamAttendee.findMany({
    where: {
      userId: { in: userIds },
      event: {
        status: "COMPLETED",
        startsAt: { gte: semester.start, lte: semester.end }
      }
    },
    select: {
      userId: true,
      creditHours: true,
      event: { select: { hours: true, startsAt: true } }
    }
  });

  const hoursByUser = new Map<string, number>();
  for (const row of attendances) {
    if (!isDateInSemester(row.event.startsAt, semester)) continue;
    hoursByUser.set(row.userId, (hoursByUser.get(row.userId) ?? 0) + livestreamAttendeeHours(row.event.hours, row.creditHours));
  }

  return hoursByUser;
}
