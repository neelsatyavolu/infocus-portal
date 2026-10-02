import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { getRealSessionUser, requireUserId, syncUserProfile } from "@/src/lib/auth";
import { isAppReviewEmail } from "@/src/lib/app-review";
import { okUnmapped } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { NICKNAME_MAX_LENGTH, normalizeNickname } from "@/src/lib/user-display";

const updateProfileSchema = z.object({
  nickname: z.string().max(NICKNAME_MAX_LENGTH).nullable()
});

/**
 * `sampleOnly`: the Apple App Review account (src/lib/app-review.ts), judged by who really
 * signed in. The iPhone app then shows only its sample workspace and Settings.
 */
async function serializeProfile(user: { email: string | null; name: string | null; nickname: string | null }) {
  const real = await getRealSessionUser();
  return {
    email: user.email,
    name: user.name,
    nickname: user.nickname,
    sampleOnly: isAppReviewEmail(real?.email ?? user.email)
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);

    return okUnmapped(await serializeProfile(user));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const payload = updateProfileSchema.parse(await request.json());

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        nickname: normalizeNickname(payload.nickname)
      },
      select: {
        email: true,
        name: true,
        nickname: true
      }
    });

    return okUnmapped(await serializeProfile(updated));
  } catch (error) {
    return handleRouteError(error);
  }
}
