import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { requireLivestreamManagerAccess } from "@/src/server/livestream-access";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  startsAt: z.string().min(1).optional(),
  location: z.string().trim().max(200).optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
  availability: z.enum(["PUBLIC", "UNLISTED", "UNCONFIRMED"]).optional(),
  hours: z.number().min(0).max(24).nullable().optional(),
  capacity: z.number().int().min(1).max(50).optional(),
  notes: z.string().max(1000).optional(),
  managerUserId: z.string().min(1).nullable().optional(),
  attendeeCredits: z.array(z.object({
    userId: z.string().min(1),
    creditHours: z.number().min(0).max(24).nullable()
  })).max(50).optional(),
  attendeeUserIds: z.array(z.string().min(1)).max(50).optional()
});

type RouteContext = { params: Promise<{ eventId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    await requireLivestreamManagerAccess(user.id, access.role);

    const rate = limitByKey(getRequestKey(request, "livestreams:event:patch"), {
      max: 120,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const { eventId } = await context.params;
    const existing = await prisma.livestreamEvent.findUnique({ where: { id: eventId } });
    if (!existing) {
      throw new Error("NOT_FOUND");
    }

    const body = patchSchema.parse(await request.json());
    if (body.attendeeCredits?.some((entry) => !body.attendeeUserIds?.includes(entry.userId))) {
      return fail("Credit overrides must belong to the supplied attendees.", 400);
    }
    const credits = new Map(body.attendeeCredits?.map((entry) => [entry.userId, entry.creditHours]));
    let startsAt: Date | undefined;
    if (body.startsAt) {
      startsAt = new Date(body.startsAt);
      if (Number.isNaN(startsAt.getTime())) {
        return fail("Invalid startsAt datetime.", 400);
      }
    }

    const nextStatus = body.status ?? existing.status;
    const nextHours = body.hours !== undefined ? body.hours : existing.hours;
    if (nextStatus === "COMPLETED" && (nextHours === null || nextHours === undefined)) {
      return fail("Hours are required when marking an event completed.", 400);
    }

    const attendeeUserIds =
      body.attendeeUserIds !== undefined ? Array.from(new Set(body.attendeeUserIds)) : null;

    const event = await prisma.$transaction(async (tx) => {
      if (attendeeUserIds) {
        await tx.livestreamAttendee.deleteMany({
          where: {
            eventId,
            userId: { notIn: attendeeUserIds }
          }
        });
        for (const id of attendeeUserIds) {
          await tx.livestreamAttendee.upsert({
            where: { eventId_userId: { eventId, userId: id } },
            create: { eventId, userId: id, creditHours: credits.get(id) },
            update: { creditHours: credits.get(id) }
          });
        }
      }

      return tx.livestreamEvent.update({
        where: { id: eventId },
        data: {
          title: body.title,
          startsAt,
          location: body.location,
          status: body.status,
          availability: body.availability,
          hours: body.hours === undefined ? undefined : body.hours,
          capacity: body.capacity,
          notes: body.notes,
          managerUserId: body.managerUserId === undefined ? undefined : body.managerUserId
        },
        include: {
          manager: { select: { id: true, name: true, nickname: true, email: true } },
          attendees: { include: { user: { select: { id: true, name: true, nickname: true, email: true } } } }
        }
      });
    });

    return ok({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      location: event.location,
      status: event.status,
      availability: event.availability,
      hours: event.hours,
      capacity: event.capacity,
      notes: event.notes,
      manager: event.manager,
      attendees: event.attendees.map((a) => ({ ...a.user, creditHours: a.creditHours }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    await requireLivestreamManagerAccess(user.id, access.role);

    const rate = limitByKey(getRequestKey(request, "livestreams:event:delete"), {
      max: 40,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const { eventId } = await context.params;
    const existing = await prisma.livestreamEvent.findUnique({ where: { id: eventId } });
    if (!existing) {
      throw new Error("NOT_FOUND");
    }

    await prisma.livestreamEvent.delete({ where: { id: eventId } });
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
