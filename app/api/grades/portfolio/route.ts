import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { MAX_PORTFOLIO_POINTS } from "@/src/lib/grading";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole, seesStudentGrades } from "@/src/lib/platform-admin";
import {
  currentPortfolioSemester,
  portfolioLinkSchema,
  portfolioPointsOrNull,
  portfolioSemesterSchema
} from "@/src/lib/portfolio";
import { prisma } from "@/src/lib/prisma";

const payloadSchema = z.object({
  userId: z.string().min(1),
  semester: portfolioSemesterSchema.optional(),
  /** null clears the score back to ungraded (a link the student submitted is kept). */
  points: z.number().int().min(0).max(MAX_PORTFOLIO_POINTS).nullable(),
  feedback: z.string().max(1200).optional()
});

/** A student's own link for the current semester; empty or null removes it. */
const linkPayloadSchema = z.object({
  link: z.union([portfolioLinkSchema, z.literal(""), z.null()])
});

async function requireGrader() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!hasPlatformRole(access.role, "EXECUTIVE_PRODUCER")) {
    throw new Error("FORBIDDEN");
  }
}

export async function GET(request: Request) {
  try {
    await requireGrader();
    const requested = new URL(request.url).searchParams.get("semester");
    const semester = requested ? portfolioSemesterSchema.parse(requested) : currentPortfolioSemester();

    const grades = await prisma.portfolioGrade.findMany({
      where: { semester },
      include: { user: { select: { id: true, name: true, nickname: true, email: true } } }
    });

    return ok({
      semester,
      maxPoints: MAX_PORTFOLIO_POINTS,
      grades: grades.map((grade) => ({
        userId: grade.userId,
        points: portfolioPointsOrNull(grade.points),
        feedback: grade.feedback,
        link: grade.link,
        student: grade.user
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireGrader();
    const payload = payloadSchema.parse(await request.json());
    const semester = payload.semester ?? currentPortfolioSemester();
    const points = payload.points ?? null;
    const feedback = payload.feedback?.trim();

    const saved = await prisma.portfolioGrade.upsert({
      where: { userId_semester: { userId: payload.userId, semester } },
      update: { points, ...(feedback === undefined ? {} : { feedback }) },
      create: { userId: payload.userId, semester, points, feedback: feedback ?? "" }
    });

    return ok({ userId: saved.userId, semester: saved.semester, points: portfolioPointsOrNull(saved.points) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!seesStudentGrades(access.role)) {
      throw new Error("FORBIDDEN");
    }

    const { link: raw } = linkPayloadSchema.parse(await request.json());
    const link = raw ? raw : null;
    const semester = currentPortfolioSemester();

    const saved = await prisma.portfolioGrade.upsert({
      where: { userId_semester: { userId: user.id, semester } },
      update: { link },
      create: { userId: user.id, semester, link, points: null }
    });

    return ok({ semester: saved.semester, link: saved.link });
  } catch (error) {
    return handleRouteError(error);
  }
}
