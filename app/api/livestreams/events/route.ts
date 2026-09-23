import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { DEFAULT_LIVESTREAM_CAPACITY } from "@/src/lib/livestream";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { requireLivestreamManagerAccess } from "@/src/server/livestream-access";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: z.string().min(1),
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

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    await requireLivestreamManagerAccess(user.id, access.role);

    const rate = limitByKey(getRequestKey(request, "livestreams:event:create"), {
      max: 60,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const body = createSchema.parse(await request.json());
    if (body.attendeeCredits?.some((entry) => !body.attendeeUserIds?.includes(entry.userId))) {
      return fail("Credit overrides must belong to the supplied attendees.", 400);
    }
    const credits = new Map(body.attendeeCredits?.map((entry) => [entry.userId, entry.creditHours]));
    const startsAt = new Date(body.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      return fail("Invalid startsAt datetime.", 400);
    }

    const status = body.status ?? "SCHEDULED";
    if (status === "COMPLETED" && (body.hours === null || body.hours === undefined)) {
      return fail("Hours are required when marking an event completed.", 400);
    }

    const attendeeUserIds = Array.from(new Set(body.attendeeUserIds ?? []));

    const event = await prisma.livestreamEvent.create({
      data: {
        title: body.title,
        startsAt,
        location: body.location ?? "",
        status,
        availability: body.availability ?? "UNCONFIRMED",
        hours: body.hours ?? null,
        capacity: body.capacity ?? DEFAULT_LIVESTREAM_CAPACITY,
        notes: body.notes ?? "",
        managerUserId: body.managerUserId ?? null,
        attendees: attendeeUserIds.length
          ? {
              create: attendeeUserIds.map((id) => ({ userId: id, creditHours: credits.get(id) }))
            }
          : undefined
      },
      include: {
        manager: { select: { id: true, name: true, nickname: true, email: true } },
        attendees: { include: { user: { select: { id: true, name: true, nickname: true, email: true } } } }
      }
    });

    return ok(
      {
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
      },
      201
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
