import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { requireLivestreamManagerAccess } from "@/src/server/livestream-access";

const patchSchema = z.object({
  status: z.enum(["APPROVED", "DENIED"])
});

type RouteContext = { params: Promise<{ signupId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    await requireLivestreamManagerAccess(user.id, access.role);

    const rate = limitByKey(getRequestKey(request, "livestreams:signup:review"), {
      max: 80,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const { signupId } = await context.params;
    const body = patchSchema.parse(await request.json());

    const signup = await prisma.livestreamSignupRequest.findUnique({
      where: { id: signupId },
      include: {
        event: { include: { _count: { select: { attendees: true } } } }
      }
    });
    if (!signup) {
      throw new Error("NOT_FOUND");
    }
    if (signup.status !== "PENDING") {
      return fail("This request was already reviewed.", 400);
    }

    if (body.status === "APPROVED") {
      if (signup.event.status === "CANCELLED") {
        return fail("Cannot approve a signup for a cancelled event.", 400);
      }
      if (signup.event._count.attendees >= signup.event.capacity) {
        return fail("This livestream is full.", 400);
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.livestreamAttendee.upsert({
          where: {
            eventId_userId: { eventId: signup.eventId, userId: signup.userId }
          },
          create: { eventId: signup.eventId, userId: signup.userId },
          update: {}
        });

        return tx.livestreamSignupRequest.update({
          where: { id: signupId },
          data: {
            status: "APPROVED",
            reviewedAt: new Date(),
            reviewedByUserId: user.id
          }
        });
      });

      return ok({
        id: updated.id,
        status: updated.status,
        eventId: updated.eventId,
        userId: updated.userId,
        reviewedAt: updated.reviewedAt?.toISOString() ?? null
      });
    }

    const denied = await prisma.livestreamSignupRequest.update({
      where: { id: signupId },
      data: {
        status: "DENIED",
        reviewedAt: new Date(),
        reviewedByUserId: user.id
      }
    });

    return ok({
      id: denied.id,
      status: denied.status,
      eventId: denied.eventId,
      userId: denied.userId,
      reviewedAt: denied.reviewedAt?.toISOString() ?? null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
