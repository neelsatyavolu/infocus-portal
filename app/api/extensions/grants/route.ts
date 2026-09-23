import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { resolveGrantTerms } from "@/src/lib/package-extensions";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { labeledUser } from "@/src/lib/user-display";
import { notifyExecsOfExtensionGrant } from "@/src/server/extension-grant-notify";
import { mayGrantExtensions } from "@/src/server/extension-requests";
import { MAX_CYCLES_PER_SEMESTER } from "@/src/server/program-settings";

const cycleSchema = z.coerce.number().int().min(1).max(MAX_CYCLES_PER_SEMESTER);

const grantSchema = z.object({
  progressRowId: z.string().min(1),
  days: z.number().int().min(1).max(30),
  /** Omit or send every member for the whole group. */
  grantedUserIds: z.array(z.string().min(1)).max(50).optional(),
  reason: z.string().max(1200)
});

async function requireGranter() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!mayGrantExtensions(access.role)) {
    throw new Error("FORBIDDEN");
  }
  return userId;
}

/** Package groups for one cycle, for the exec grant form. */
export async function GET(request: Request) {
  try {
    await requireGranter();
    const cycleNumber = cycleSchema.parse(new URL(request.url).searchParams.get("cycleNumber"));

    const rows = await prisma.packageProgressRow.findMany({
      where: { cycleNumber, members: { some: {} } },
      orderBy: { rowOrder: "asc" },
      select: {
        id: true,
        groupTopic: true,
        members: {
          select: { userId: true, user: { select: { id: true, name: true, nickname: true, email: true } } }
        }
      }
    });

    return ok({
      groups: rows.map((row) => ({
        id: row.id,
        groupTopic: row.groupTopic,
        members: row.members.map((member) => ({ userId: member.userId, ...labeledUser(member.user) }))
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** An exec grants an extension directly. It counts as the first approval; one more exec must approve. */
export async function POST(request: Request) {
  try {
    const userId = await requireGranter();

    const rate = limitByKey(getRequestKey(request, "extensions:grant"), { max: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = grantSchema.parse(await request.json());

    const row = await prisma.packageProgressRow.findUnique({
      where: { id: payload.progressRowId },
      select: { id: true, cycleNumber: true, members: { select: { userId: true } } }
    });
    if (!row) {
      throw new Error("NOT_FOUND");
    }

    const memberUserIds = row.members.map((member) => member.userId);
    if (memberUserIds.length === 0) {
      throw new Error("This package group has no members yet.");
    }
    if (memberUserIds.includes(userId)) {
      throw new Error("You can't grant an extension to your own package group.");
    }

    const terms = resolveGrantTerms({
      requestedDays: payload.days,
      memberUserIds,
      grantedDays: payload.days,
      grantedUserIds: payload.grantedUserIds
    });

    const created = await prisma.$transaction(async (tx) => {
      const grant = await tx.packageExtensionRequest.create({
        data: {
          userId,
          progressRowId: row.id,
          cycleNumber: row.cycleNumber,
          requestedDays: payload.days,
          reason: payload.reason.trim(),
          producerGranted: true,
          ...terms
        }
      });
      await tx.packageExtensionApproval.create({
        data: { requestId: grant.id, userId, approved: true }
      });
      return grant;
    });

    await notifyExecsOfExtensionGrant(created.id);

    return ok({ id: created.id }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
