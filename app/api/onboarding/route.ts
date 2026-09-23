import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, okUnmapped } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { NICKNAME_MAX_LENGTH, normalizeNickname } from "@/src/lib/user-display";

const onboardingSchema = z.object({
  nickname: z.string().trim().min(1).max(NICKNAME_MAX_LENGTH),
  notifications: z.object({
    emailEnabled: z.boolean(),
    notificationEmail: z.string().trim().email().max(254).nullable().optional(),
    browserEnabled: z.boolean(),
    emailAnnouncementsEnabled: z.boolean(),
    emailCommentsEnabled: z.boolean(),
    emailGradesEnabled: z.boolean(),
    browserAnnouncementsEnabled: z.boolean(),
    browserCommentsEnabled: z.boolean(),
    browserGradesEnabled: z.boolean()
  })
});

const DEFAULT_NOTIFICATION_SETTINGS = {
  emailEnabled: true,
  notificationEmail: null,
  browserEnabled: false,
  emailAnnouncementsEnabled: true,
  emailCommentsEnabled: true,
  emailGradesEnabled: false,
  browserAnnouncementsEnabled: true,
  browserCommentsEnabled: true,
  browserGradesEnabled: false
};

function fallbackNameFromEmail(email: string | null) {
  if (!email) {
    return "";
  }

  const localPart = email.split("@")[0]?.trim() ?? "";
  if (!localPart) {
    return "";
  }

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);

    const preference = await prisma.notificationPreference.findUnique({
      where: { userId: user.id }
    });

    return okUnmapped({
      email: user.email,
      name: user.name,
      nickname: user.nickname?.trim() || user.name?.trim() || fallbackNameFromEmail(user.email),
      onboardingCompleted: Boolean(user.onboardingCompletedAt),
      notifications: preference
        ? {
            emailEnabled: preference.emailEnabled,
            notificationEmail: preference.notificationEmail,
            browserEnabled: preference.browserEnabled,
            emailAnnouncementsEnabled: preference.emailAnnouncementsEnabled,
            emailCommentsEnabled: preference.emailCommentsEnabled,
            emailGradesEnabled: preference.emailGradesEnabled,
            browserAnnouncementsEnabled: preference.browserAnnouncementsEnabled,
            browserCommentsEnabled: preference.browserCommentsEnabled,
            browserGradesEnabled: preference.browserGradesEnabled
          }
        : DEFAULT_NOTIFICATION_SETTINGS
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const payload = onboardingSchema.parse(await request.json());
    const notificationEmail = payload.notifications.notificationEmail ?? null;

    if (payload.notifications.emailEnabled && !notificationEmail && !user.email) {
      return fail("A notification email is required because your account email is missing.", 400);
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        nickname: normalizeNickname(payload.nickname),
        onboardingCompletedAt: new Date()
      }
    });

    const preference = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update: {
        emailEnabled: payload.notifications.emailEnabled,
        notificationEmail,
        browserEnabled: payload.notifications.browserEnabled,
        emailAnnouncementsEnabled: payload.notifications.emailAnnouncementsEnabled,
        emailCommentsEnabled: payload.notifications.emailCommentsEnabled,
        emailGradesEnabled: payload.notifications.emailGradesEnabled,
        browserAnnouncementsEnabled: payload.notifications.browserAnnouncementsEnabled,
        browserCommentsEnabled: payload.notifications.browserCommentsEnabled,
        browserGradesEnabled: payload.notifications.browserGradesEnabled
      },
      create: {
        userId: user.id,
        emailEnabled: payload.notifications.emailEnabled,
        notificationEmail,
        browserEnabled: payload.notifications.browserEnabled,
        emailAnnouncementsEnabled: payload.notifications.emailAnnouncementsEnabled,
        emailCommentsEnabled: payload.notifications.emailCommentsEnabled,
        emailGradesEnabled: payload.notifications.emailGradesEnabled,
        browserAnnouncementsEnabled: payload.notifications.browserAnnouncementsEnabled,
        browserCommentsEnabled: payload.notifications.browserCommentsEnabled,
        browserGradesEnabled: payload.notifications.browserGradesEnabled
      }
    });

    return okUnmapped({
      email: updatedUser.email,
      name: updatedUser.name,
      nickname: updatedUser.nickname,
      onboardingCompleted: Boolean(updatedUser.onboardingCompletedAt),
      notifications: {
        emailEnabled: preference.emailEnabled,
        notificationEmail: preference.notificationEmail,
        browserEnabled: preference.browserEnabled,
        emailAnnouncementsEnabled: preference.emailAnnouncementsEnabled,
        emailCommentsEnabled: preference.emailCommentsEnabled,
        emailGradesEnabled: preference.emailGradesEnabled,
        browserAnnouncementsEnabled: preference.browserAnnouncementsEnabled,
        browserCommentsEnabled: preference.browserCommentsEnabled,
        browserGradesEnabled: preference.browserGradesEnabled
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
