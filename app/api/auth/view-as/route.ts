import { NextRequest } from "next/server";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import {
  createViewAsToken,
  getRealSessionUser,
  getViewAsCookieMeta
} from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { canControlViewAs, canViewAsTarget, VIEW_AS_COOKIE_NAME } from "@/src/lib/view-as";

const schema = z.object({
  userId: z.string().min(1).nullable()
});

export async function POST(request: NextRequest) {
  try {
    const real = await getRealSessionUser();
    if (!real) {
      throw new Error("UNAUTHORIZED");
    }
    if (!canControlViewAs(real.email)) {
      throw new Error("FORBIDDEN");
    }

    const payload = schema.parse(await request.json());
    const host = request.headers.get("host");
    const response = ok({ ok: true });

    if (!payload.userId || payload.userId === real.userId) {
      response.cookies.set(VIEW_AS_COOKIE_NAME, "", {
        ...getViewAsCookieMeta(host),
        maxAge: 0
      });
      return response;
    }

    const target = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true }
    });
    if (!target) {
      return fail("User not found.", 404);
    }
    if (!canViewAsTarget(real.email, target.email)) {
      throw new Error("FORBIDDEN");
    }

    response.cookies.set(
      VIEW_AS_COOKIE_NAME,
      createViewAsToken({ actorUserId: real.userId, targetUserId: target.id }),
      getViewAsCookieMeta(host)
    );
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
