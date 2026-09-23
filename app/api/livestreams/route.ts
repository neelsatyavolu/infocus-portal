import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import {
  capacityTone,
  DEFAULT_LIVESTREAM_CAPACITY,
  REQUIRED_LIVESTREAM_HOURS,
  semesterForDate
} from "@/src/lib/livestream";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { canAppointLivestreamManagers, canManageLivestreams, isLivestreamManager } from "@/src/server/livestream-access";
import { userDisplayName } from "@/src/lib/user-display";

function serializeUser(user: { id: string; name: string | null; nickname?: string | null; email: string | null }) {
  return { id: user.id, name: userDisplayName(user) || user.name, email: user.email };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const canManage = await canManageLivestreams(user.id, access.role);
    const canSignup = !(await isLivestreamManager(user.id));
    const canAppointManagers = canAppointLivestreamManagers(access.role);
    const semester = semesterForDate();

    const [events, managers, myPendingSignups, allPendingSignups] = await Promise.all([
      prisma.livestreamEvent.findMany({
        where: {
          startsAt: { gte: semester.start, lte: semester.end }
        },
        orderBy: { startsAt: "asc" },
        include: {
          manager: { select: { id: true, name: true, nickname: true, email: true } },
          attendees: {
            include: { user: { select: { id: true, name: true, nickname: true, email: true } } },
            orderBy: { createdAt: "asc" }
          },
          signups: canManage
            ? {
                where: { status: "PENDING" },
                include: { user: { select: { id: true, name: true, nickname: true, email: true } } },
                orderBy: { createdAt: "asc" }
              }
            : {
                where: { userId: user.id },
                include: { user: { select: { id: true, name: true, nickname: true, email: true } } },
                orderBy: { createdAt: "asc" }
              }
        }
      }),
      canManage
        ? prisma.livestreamManager.findMany({
            include: { user: { select: { id: true, name: true, nickname: true, email: true } } },
            orderBy: { createdAt: "asc" }
          })
        : Promise.resolve([]),
      prisma.livestreamSignupRequest.findMany({
        where: { userId: user.id },
        select: { id: true, eventId: true, status: true, availableFullEvent: true, note: true, createdAt: true }
      }),
      canManage
        ? prisma.livestreamSignupRequest.findMany({
            where: { status: "PENDING" },
            include: {
              user: { select: { id: true, name: true, nickname: true, email: true } },
              event: { select: { id: true, title: true, startsAt: true } }
            },
            orderBy: { createdAt: "asc" }
          })
        : Promise.resolve([])
    ]);

    return ok({
      semester: {
        label: semester.label,
        academicYearStart: semester.academicYearStart,
        term: semester.term,
        start: semester.start.toISOString(),
        end: semester.end.toISOString()
      },
      requiredHours: REQUIRED_LIVESTREAM_HOURS,
      defaultCapacity: DEFAULT_LIVESTREAM_CAPACITY,
      canManage,
      canSignup,
      canAppointManagers,
      canViewCompletion: canManage,
      currentUserId: user.id,
      managers: managers.map((row) => serializeUser(row.user)),
      mySignups: myPendingSignups.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        status: row.status,
        availableFullEvent: row.availableFullEvent,
        note: row.note,
        createdAt: row.createdAt.toISOString()
      })),
      pendingSignups: allPendingSignups.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        status: row.status,
        availableFullEvent: "availableFullEvent" in row ? row.availableFullEvent : true,
        note: "note" in row ? row.note : "",
        createdAt: row.createdAt.toISOString(),
        user: "user" in row ? serializeUser(row.user) : null,
        event:
          "event" in row
            ? {
                id: row.event.id,
                title: row.event.title,
                startsAt: row.event.startsAt.toISOString()
              }
            : null
      })),
      events: events.map((event) => {
        const attendeeCount = event.attendees.length;
        return {
          id: event.id,
          title: event.title,
          startsAt: event.startsAt.toISOString(),
          location: event.location,
          status: event.status,
          availability: event.availability,
          hours: event.hours,
          capacity: event.capacity,
          notes: event.notes,
          manager: event.manager ? serializeUser(event.manager) : null,
          attendees: event.attendees.map((a) => ({ ...serializeUser(a.user), creditHours: a.creditHours })),
          attendeeCount,
          openSlots: Math.max(0, event.capacity - attendeeCount),
          capacityTone: capacityTone(attendeeCount, event.capacity),
          mySignup: event.signups.find((s) => s.userId === user.id)
            ? {
                id: event.signups.find((s) => s.userId === user.id)!.id,
                status: event.signups.find((s) => s.userId === user.id)!.status,
                availableFullEvent: event.signups.find((s) => s.userId === user.id)!.availableFullEvent
              }
            : null,
          pendingSignupCount: canManage
            ? event.signups.filter((s) => s.status === "PENDING").length
            : 0
        };
      })
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
