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
      select: { id: true, status: true, eventId: true, userId: true }
    });
    if (!signup) {
      throw new Error("NOT_FOUND");
    }
    if (signup.status !== "PENDING") {
      return fail("This request was already reviewed.", 400);
    }

    const reviewed = { status: body.status, reviewedAt: new Date(), reviewedByUserId: user.id };

    if (body.status === "APPROVED") {
      // Lock the event row so two approvals can't both take the last slot.
      const outcome = await prisma.$transaction(async (tx) => {
        const [event] = await tx.$queryRaw<Array<{ status: string; capacity: number }>>`
          SELECT "status"::text AS "status", "capacity" FROM "LivestreamEvent" WHERE "id" = ${signup.eventId} FOR UPDATE`;
        if (!event) return { error: "NOT_FOUND" as const };
        if (event.status === "CANCELLED") return { error: "CANCELLED" as const };

        const [attendees, alreadyAttending] = await Promise.all([
          tx.livestreamAttendee.count({ where: { eventId: signup.eventId } }),
          tx.livestreamAttendee.findUnique({
            where: { eventId_userId: { eventId: signup.eventId, userId: signup.userId } },
            select: { id: true }
          })
        ]);
        if (!alreadyAttending && attendees >= event.capacity) return { error: "FULL" as const };

        const claimed = await tx.livestreamSignupRequest.updateMany({
          where: { id: signupId, status: "PENDING" },
          data: reviewed
        });
        if (claimed.count === 0) return { error: "REVIEWED" as const };

        if (!alreadyAttending) {
          await tx.livestreamAttendee.create({ data: { eventId: signup.eventId, userId: signup.userId } });
        }
        return { error: null };
      });

      if (outcome.error === "NOT_FOUND") throw new Error("NOT_FOUND");
      if (outcome.error === "CANCELLED") return fail("Cannot approve a signup for a cancelled event.", 400);
      if (outcome.error === "FULL") return fail("This livestream is full.", 400);
      if (outcome.error === "REVIEWED") return fail("This request was already reviewed.", 400);
    } else {
      const claimed = await prisma.livestreamSignupRequest.updateMany({
        where: { id: signupId, status: "PENDING" },
        data: reviewed
      });
      if (claimed.count === 0) {
        return fail("This request was already reviewed.", 400);
      }
    }

    return ok({
      id: signup.id,
      status: reviewed.status,
      eventId: signup.eventId,
      userId: signup.userId,
      reviewedAt: reviewed.reviewedAt.toISOString()
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
