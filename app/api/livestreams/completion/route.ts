import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import {
  livestreamCreditFraction,
  livestreamAttendeeHours,
  livestreamPointsFromHours,
  livestreamPointsFromManagedCount,
  REQUIRED_LIVESTREAM_HOURS,
  REQUIRED_MANAGED_LIVESTREAMS,
  semesterForDate
} from "@/src/lib/livestream";
import { emailsFromNonGradableAssignments, isExcludedFromGrading } from "@/src/lib/gradable-roster";
import { MAX_LIVESTREAM_POINTS } from "@/src/lib/grading";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { requireLivestreamManagerAccess } from "@/src/server/livestream-access";
import { managedLivestreamCountsByUserIds } from "@/src/server/livestream-credit";
import { userDisplayName } from "@/src/lib/user-display";

/**
 * Completion roster for the current (or query) semester.
 * Producers + livestream managers only. Lists students only: anyone with a platform
 * role (producers, adviser, super admin) is left out.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    await requireLivestreamManagerAccess(user.id, access.role);

    const semester = semesterForDate();

    const [users, roleAssignments, completedEvents] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, name: true, nickname: true, email: true },
        orderBy: [{ name: "asc" }, { email: "asc" }]
      }),
      prisma.platformRoleAssignment.findMany({ select: { email: true } }),
      prisma.livestreamEvent.findMany({
        where: {
          status: "COMPLETED",
          startsAt: { gte: semester.start, lte: semester.end }
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          hours: true,
          attendees: { select: { userId: true, creditHours: true } }
        }
      })
    ]);

    const staffEmails = emailsFromNonGradableAssignments(roleAssignments);
    const students = users.filter((user) => !isExcludedFromGrading(user, staffEmails));
    const managedByUser = await managedLivestreamCountsByUserIds(
      students.map((student) => student.id),
      semester
    );

    const hoursByUser = new Map<string, number>();
    const eventCountByUser = new Map<string, number>();

    for (const event of completedEvents) {
      for (const attendee of event.attendees) {
        const hours = livestreamAttendeeHours(event.hours, attendee.creditHours);
        hoursByUser.set(attendee.userId, (hoursByUser.get(attendee.userId) ?? 0) + hours);
        eventCountByUser.set(attendee.userId, (eventCountByUser.get(attendee.userId) ?? 0) + 1);
      }
    }

    return ok({
      semester: {
        label: semester.label,
        start: semester.start.toISOString(),
        end: semester.end.toISOString()
      },
      requiredHours: REQUIRED_LIVESTREAM_HOURS,
      requiredManagedEvents: REQUIRED_MANAGED_LIVESTREAMS,
      maxPoints: MAX_LIVESTREAM_POINTS,
      completedEventCount: completedEvents.length,
      rows: students.map((student) => {
        const hours = hoursByUser.get(student.id) ?? 0;
        const managedEvents = managedByUser.get(student.id);
        const isManager = managedEvents !== undefined;
        const points = isManager
          ? livestreamPointsFromManagedCount(managedEvents)
          : livestreamPointsFromHours(hours);
        const fraction = isManager ? points / MAX_LIVESTREAM_POINTS : livestreamCreditFraction(hours);
        return {
          userId: student.id,
          name: userDisplayName(student) || student.name,
          email: student.email,
          completedHours: Number(hours.toFixed(2)),
          completedEvents: eventCountByUser.get(student.id) ?? 0,
          requiredHours: REQUIRED_LIVESTREAM_HOURS,
          isManager,
          managedEvents: managedEvents ?? 0,
          requiredManagedEvents: REQUIRED_MANAGED_LIVESTREAMS,
          creditPercent: Math.round(fraction * 100),
          points
        };
      })
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
