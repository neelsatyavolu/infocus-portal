import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { okUnmapped } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { NICKNAME_MAX_LENGTH, normalizeNickname } from "@/src/lib/user-display";

const updateProfileSchema = z.object({
  nickname: z.string().max(NICKNAME_MAX_LENGTH).nullable()
});

function serializeProfile(user: { email: string | null; name: string | null; nickname: string | null }) {
  return {
    email: user.email,
    name: user.name,
    nickname: user.nickname
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);

    return okUnmapped(serializeProfile(user));
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

    return okUnmapped(serializeProfile(updated));
  } catch (error) {
    return handleRouteError(error);
  }
}
