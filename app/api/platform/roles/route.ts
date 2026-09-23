import { PlatformRole } from "@prisma/client";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import {
  getPlatformAccess,
  hardcodedPlatformRole,
  normalizeEmail
} from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";

const payloadSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(PlatformRole)
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageAllowedEmails) {
      throw new Error("FORBIDDEN");
    }

    const roles = await prisma.platformRoleAssignment.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }]
    });

    return ok(roles);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManagePlatformRoles) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(getRequestKey(request, "platform:roles:write"), { max: 30, windowMs: 60_000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = payloadSchema.parse(await request.json());
    const email = normalizeEmail(payload.email);

    if (hardcodedPlatformRole(email)) {
      throw new Error("BAD_REQUEST");
    }

    if (payload.role === PlatformRole.SUPER_ADMIN) {
      throw new Error("BAD_REQUEST");
    }

    const assignment = await prisma.platformRoleAssignment.upsert({
      where: { email },
      update: {
        role: payload.role,
        category: null
      },
      create: {
        email,
        role: payload.role,
        category: null
      }
    });

    return ok(assignment, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManagePlatformRoles) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(getRequestKey(request, "platform:roles:write"), { max: 30, windowMs: 60_000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const { searchParams } = new URL(request.url);
    const email = normalizeEmail(searchParams.get("email"));

    if (!email || hardcodedPlatformRole(email)) {
      throw new Error("BAD_REQUEST");
    }

    await prisma.platformRoleAssignment.delete({
      where: { email }
    });

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
