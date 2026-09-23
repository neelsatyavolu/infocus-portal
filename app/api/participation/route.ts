import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { parseDateInput } from "@/src/lib/extensions";
import { PARTICIPATION_POINTS_BLOCK_DAY, participationPointsForDate } from "@/src/lib/grading";
import { isExcludedFromGrading, loadNonGradableEmails } from "@/src/lib/gradable-roster";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { userDisplayName } from "@/src/lib/user-display";
import {
  pendingParticipationOverlay,
  submitParticipationGradeRequest
} from "@/src/server/participation-grade-requests";

const entrySchema = z.object({
  userId: z.string().min(1),
  date: z.string(),
  points: z.number().int().min(0).max(PARTICIPATION_POINTS_BLOCK_DAY),
  notes: z.string().max(600).optional()
});

const payloadSchema = z.object({
  entries: z.array(entrySchema).max(500)
});

function weekRange(weekStartKey: string) {
  const start = parseDateInput(weekStartKey);
  if (!start) {
    throw new Error("BAD_REQUEST");
  }

  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const { searchParams } = new URL(request.url);
    const { start, end } = weekRange(searchParams.get("weekStart") ?? "");

    const [users, entries, nonGradableEmails, pending] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, name: true, nickname: true, email: true },
        orderBy: [{ name: "asc" }, { email: "asc" }]
      }),
      prisma.participationEntry.findMany({
        where: { date: { gte: start, lt: end } }
      }),
      loadNonGradableEmails(),
      pendingParticipationOverlay({ start, end })
    ]);

    const students = users.filter((user) => !isExcludedFromGrading(user, nonGradableEmails));

    return ok({
      weekStart: searchParams.get("weekStart"),
      currentUserId: user.id,
      students,
      entries: entries.map((entry) => ({
        userId: entry.userId,
        date: entry.date.toISOString().slice(0, 10),
        points: entry.points,
        notes: entry.notes
      })),
      pendingCount: pending.pendingCount,
      pendingItems: pending.pendingItems,
      // Monday PA short period; Tue/Thu class; holidays/Wed/Fri shows = 0.
      maxPointsByDate: Array.from({ length: 7 }, (_, offset) => {
        const date = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000);
        return {
          date: date.toISOString().slice(0, 10),
          maxPoints: participationPointsForDate(date)
        };
      })
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BAD_REQUEST") {
      return fail("A valid weekStart date is required.", 400);
    }
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(getRequestKey(request, "participation:write"), {
      max: 60,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = payloadSchema.parse(await request.json());

    const entries = payload.entries.map((entry) => {
      const date = parseDateInput(entry.date);
      if (!date) {
        throw new Error("BAD_REQUEST");
      }

      // Never let a day be scored above what that weekday is worth.
      const maxPoints = participationPointsForDate(date);

      return {
        userId: entry.userId,
        date,
        points: Math.min(entry.points, maxPoints),
        notes: (entry.notes ?? "").trim()
      };
    });

    const result = await submitParticipationGradeRequest(
      { id: user.id, email: user.email, name: userDisplayName(user) || user.name },
      entries
    );

    return ok(result);
  } catch (error) {
    if (error instanceof Error && error.message === "BAD_REQUEST") {
      return fail("Invalid participation entry.", 400);
    }
    return handleRouteError(error);
  }
}
