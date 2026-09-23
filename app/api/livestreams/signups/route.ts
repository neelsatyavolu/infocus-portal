import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { canManageLivestreams, isLivestreamManager } from "@/src/server/livestream-access";

const createSchema = z.object({
  eventId: z.string().min(1),
  availableFullEvent: z.boolean().optional(),
  note: z.string().max(500).optional()
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const canManage = await canManageLivestreams(user.id, access.role);

    const signups = await prisma.livestreamSignupRequest.findMany({
      where: canManage ? {} : { userId: user.id },
      include: {
        user: { select: { id: true, name: true, nickname: true, email: true } },
        event: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            location: true,
            status: true,
            capacity: true,
            _count: { select: { attendees: true } }
          }
        }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }]
    });

    return ok({
      canManage,
      signups: signups.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        userId: row.userId,
        status: row.status,
        availableFullEvent: row.availableFullEvent,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        user: row.user,
        event: {
          id: row.event.id,
          title: row.event.title,
          startsAt: row.event.startsAt.toISOString(),
          location: row.event.location,
          status: row.event.status,
          capacity: row.event.capacity,
          attendeeCount: row.event._count.attendees
        }
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await syncUserProfile(userId);
    if (await isLivestreamManager(userId)) {
      return fail("Livestream managers cannot request sign-ups.", 403);
    }

    const rate = limitByKey(getRequestKey(request, "livestreams:signup:create"), {
      max: 30,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const body = createSchema.parse(await request.json());
    const event = await prisma.livestreamEvent.findUnique({
      where: { id: body.eventId },
      include: { _count: { select: { attendees: true } } }
    });
    if (!event) {
      throw new Error("NOT_FOUND");
    }
    if (event.status === "CANCELLED") {
      return fail("This livestream was cancelled.", 400);
    }
    if (event.status === "COMPLETED") {
      return fail("This livestream is already completed.", 400);
    }

    const alreadyAttending = await prisma.livestreamAttendee.findUnique({
      where: { eventId_userId: { eventId: event.id, userId } }
    });
    if (alreadyAttending) {
      return fail("You are already on the crew for this livestream.", 400);
    }

    if (event._count.attendees >= event.capacity) {
      return fail("This livestream is full.", 400);
    }

    const existing = await prisma.livestreamSignupRequest.findUnique({
      where: { eventId_userId: { eventId: event.id, userId } }
    });
    if (existing?.status === "PENDING") {
      return fail("You already have a pending request for this livestream.", 400);
    }
    if (existing?.status === "APPROVED") {
      return fail("Your signup was already approved.", 400);
    }

    const row = existing
      ? await prisma.livestreamSignupRequest.update({
          where: { id: existing.id },
          data: {
            status: "PENDING",
            availableFullEvent: body.availableFullEvent ?? true,
            note: body.note ?? "",
            reviewedAt: null,
            reviewedByUserId: null
          }
        })
      : await prisma.livestreamSignupRequest.create({
          data: {
            eventId: event.id,
            userId,
            availableFullEvent: body.availableFullEvent ?? true,
            note: body.note ?? ""
          }
        });

    return ok(
      {
        id: row.id,
        eventId: row.eventId,
        status: row.status,
        availableFullEvent: row.availableFullEvent,
        note: row.note,
        createdAt: row.createdAt.toISOString()
      },
      201
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
