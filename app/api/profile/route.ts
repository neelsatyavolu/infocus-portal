import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { getRealSessionUser, requireUserId, syncUserProfile } from "@/src/lib/auth";
import { isValidBirthday } from "@/src/lib/birthdays";
import { isAppReviewEmail } from "@/src/lib/app-review";
import { okUnmapped } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { NICKNAME_MAX_LENGTH, normalizeNickname } from "@/src/lib/user-display";

const birthdaySchema = z
  .object({ month: z.number().int(), day: z.number().int() })
  .refine(({ month, day }) => isValidBirthday(month, day), "That isn't a real date.");

/** Each field is optional: a PATCH changes only what it sends. A null birthday clears it. */
const updateProfileSchema = z.object({
  nickname: z.string().max(NICKNAME_MAX_LENGTH).nullable().optional(),
  birthday: birthdaySchema.nullable().optional()
});

type ProfileFields = {
  email: string | null;
  name: string | null;
  nickname: string | null;
  birthdayMonth: number | null;
  birthdayDay: number | null;
};

/**
 * `sampleOnly`: the Apple App Review account (src/lib/app-review.ts), judged by who really
 * signed in. The iPhone app then shows only its sample workspace and Settings.
 */
async function serializeProfile(user: ProfileFields) {
  const real = await getRealSessionUser();
  return {
    email: user.email,
    name: user.name,
    nickname: user.nickname,
    birthdayMonth: user.birthdayMonth,
    birthdayDay: user.birthdayDay,
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
        ...(payload.nickname !== undefined ? { nickname: normalizeNickname(payload.nickname) } : {}),
        ...(payload.birthday !== undefined
          ? { birthdayMonth: payload.birthday?.month ?? null, birthdayDay: payload.birthday?.day ?? null }
          : {})
      },
      select: {
        email: true,
        name: true,
        nickname: true,
        birthdayMonth: true,
        birthdayDay: true
      }
    });

    return okUnmapped(await serializeProfile(updated));
  } catch (error) {
    return handleRouteError(error);
  }
}
