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
      include: { event: true }
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

      const updated = await prisma.$transaction(async (tx) => {
        // Lock the event so two approvals can't both pass the capacity check.
        const [event] = await tx.$queryRaw<Array<{ capacity: number; status: string }>>`
          SELECT "capacity", "status"::text AS "status"
          FROM "LivestreamEvent"
          WHERE "id" = ${signup.eventId}
          FOR UPDATE
        `;
        if (!event) throw new Error("NOT_FOUND");
        if (event.status === "CANCELLED") throw new Error("LIVESTREAM_CANCELLED");

        const claimed = await tx.livestreamSignupRequest.updateMany({
          where: { id: signupId, status: "PENDING" },
          data: {
            status: "APPROVED",
            reviewedAt: new Date(),
            reviewedByUserId: user.id
          }
        });
        if (claimed.count !== 1) throw new Error("ALREADY_REVIEWED");

        await tx.livestreamAttendee.upsert({
          where: {
            eventId_userId: { eventId: signup.eventId, userId: signup.userId }
          },
          create: { eventId: signup.eventId, userId: signup.userId },
          update: {}
        });
        const attendees = await tx.livestreamAttendee.count({ where: { eventId: signup.eventId } });
        if (attendees > event.capacity) throw new Error("LIVESTREAM_FULL");

        return tx.livestreamSignupRequest.findUniqueOrThrow({ where: { id: signupId } });
      }).catch((error: unknown) => {
        if (error instanceof Error && error.message === "LIVESTREAM_FULL") {
          return fail("This livestream is full.", 400);
        }
        if (error instanceof Error && error.message === "LIVESTREAM_CANCELLED") {
          return fail("Cannot approve a signup for a cancelled event.", 400);
        }
        if (error instanceof Error && error.message === "ALREADY_REVIEWED") {
          return fail("This request was already reviewed.", 400);
        }
        throw error;
      });

      if (updated instanceof Response) return updated;

      return ok({
        id: updated.id,
        status: updated.status,
        eventId: updated.eventId,
        userId: updated.userId,
        reviewedAt: updated.reviewedAt?.toISOString() ?? null
      });
    }

    const deniedUpdate = await prisma.livestreamSignupRequest.updateMany({
      where: { id: signupId, status: "PENDING" },
      data: {
        status: "DENIED",
        reviewedAt: new Date(),
        reviewedByUserId: user.id
      }
    });
    if (deniedUpdate.count !== 1) {
      return fail("This request was already reviewed.", 400);
    }
    const denied = await prisma.livestreamSignupRequest.findUniqueOrThrow({
      where: { id: signupId }
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
