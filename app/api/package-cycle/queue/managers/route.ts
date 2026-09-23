import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { labeledUser } from "@/src/lib/user-display";

const bodySchema = z.object({ userId: z.string().trim().min(1) });
const userSelect = { id: true, name: true, nickname: true, email: true } as const;

async function requireProducer() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) throw new Error("FORBIDDEN");
  return user;
}

export async function GET() {
  try {
    await requireProducer();
    const [managers, candidates] = await Promise.all([
      prisma.publishingManager.findMany({
        select: { userId: true, user: { select: userSelect } },
        orderBy: { createdAt: "asc" }
      }),
      prisma.user.findMany({ where: { email: { not: null } }, select: userSelect, orderBy: { name: "asc" } })
    ]);
    return ok({
      managers: managers.map((row) => ({ userId: row.userId, ...labeledUser(row.user) })),
      candidates: candidates.map((user) => ({ id: user.id, ...labeledUser(user) }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireProducer();
    const rate = limitByKey(getRequestKey(request, "publishing:managers:add"), { max: 40, windowMs: 60_000 });
    if (!rate.allowed) throw new Error("TOO_MANY_REQUESTS");
    const body = bodySchema.parse(await request.json());
    const target = await prisma.user.findUnique({ where: { id: body.userId }, select: userSelect });
    if (!target || target.email === null) return fail("Registered user not found.", 404);
    await prisma.publishingManager.upsert({
      where: { userId: target.id },
      create: { userId: target.id, createdByUserId: user.id },
      update: {}
    });
    return ok({ userId: target.id, ...labeledUser(target) }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireProducer();
    const userId = new URL(request.url).searchParams.get("userId")?.trim();
    if (!userId) return fail("userId is required.", 400);
    await prisma.publishingManager.deleteMany({ where: { userId } });
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
