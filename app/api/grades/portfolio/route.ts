import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { MAX_PORTFOLIO_POINTS } from "@/src/lib/grading";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

const payloadSchema = z.object({
  userId: z.string().min(1),
  points: z.number().int().min(0).max(MAX_PORTFOLIO_POINTS),
  feedback: z.string().max(1200).optional()
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "EXECUTIVE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const grades = await prisma.portfolioGrade.findMany({
      include: { user: { select: { id: true, name: true, nickname: true, email: true } } }
    });

    return ok({
      maxPoints: MAX_PORTFOLIO_POINTS,
      grades: grades.map((grade) => ({
        userId: grade.userId,
        points: grade.points,
        feedback: grade.feedback,
        student: grade.user
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "EXECUTIVE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const payload = payloadSchema.parse(await request.json());

    const saved = await prisma.portfolioGrade.upsert({
      where: { userId: payload.userId },
      update: { points: payload.points, feedback: payload.feedback?.trim() ?? "" },
      create: {
        userId: payload.userId,
        points: payload.points,
        feedback: payload.feedback?.trim() ?? ""
      }
    });

    return ok({ userId: saved.userId, points: saved.points });
  } catch (error) {
    return handleRouteError(error);
  }
}
