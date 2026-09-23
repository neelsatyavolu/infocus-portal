import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";

const notificationPreferenceSchema = z.object({
  emailEnabled: z.boolean(),
  notificationEmail: z.string().trim().email().max(254).nullable().optional(),
  browserEnabled: z.boolean(),
  emailAnnouncementsEnabled: z.boolean(),
  emailCommentsEnabled: z.boolean(),
  emailGradesEnabled: z.boolean(),
  browserAnnouncementsEnabled: z.boolean(),
  browserCommentsEnabled: z.boolean(),
  browserGradesEnabled: z.boolean()
});

const DEFAULT_SETTINGS = {
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

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);

    const preference = await prisma.notificationPreference.findUnique({
      where: { userId: user.id }
    });

    if (!preference) {
      return ok(DEFAULT_SETTINGS);
    }

    return ok({
      emailEnabled: preference.emailEnabled,
      notificationEmail: preference.notificationEmail,
      browserEnabled: preference.browserEnabled,
      emailAnnouncementsEnabled: preference.emailAnnouncementsEnabled,
      emailCommentsEnabled: preference.emailCommentsEnabled,
      emailGradesEnabled: preference.emailGradesEnabled,
      browserAnnouncementsEnabled: preference.browserAnnouncementsEnabled,
      browserCommentsEnabled: preference.browserCommentsEnabled,
      browserGradesEnabled: preference.browserGradesEnabled
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const payload = notificationPreferenceSchema.parse(await request.json());
    const notificationEmail = payload.notificationEmail ?? null;

    if (payload.emailEnabled && !notificationEmail && !user.email) {
      return fail("A notification email is required because your account email is missing.", 400);
    }

    const preference = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update: {
        emailEnabled: payload.emailEnabled,
        notificationEmail,
        browserEnabled: payload.browserEnabled,
        emailAnnouncementsEnabled: payload.emailAnnouncementsEnabled,
        emailCommentsEnabled: payload.emailCommentsEnabled,
        emailGradesEnabled: payload.emailGradesEnabled,
        browserAnnouncementsEnabled: payload.browserAnnouncementsEnabled,
        browserCommentsEnabled: payload.browserCommentsEnabled,
        browserGradesEnabled: payload.browserGradesEnabled
      },
      create: {
        userId: user.id,
        emailEnabled: payload.emailEnabled,
        notificationEmail,
        browserEnabled: payload.browserEnabled,
        emailAnnouncementsEnabled: payload.emailAnnouncementsEnabled,
        emailCommentsEnabled: payload.emailCommentsEnabled,
        emailGradesEnabled: payload.emailGradesEnabled,
        browserAnnouncementsEnabled: payload.browserAnnouncementsEnabled,
        browserCommentsEnabled: payload.browserCommentsEnabled,
        browserGradesEnabled: payload.browserGradesEnabled
      }
    });

    return ok({
      emailEnabled: preference.emailEnabled,
      notificationEmail: preference.notificationEmail,
      browserEnabled: preference.browserEnabled,
      emailAnnouncementsEnabled: preference.emailAnnouncementsEnabled,
      emailCommentsEnabled: preference.emailCommentsEnabled,
      emailGradesEnabled: preference.emailGradesEnabled,
      browserAnnouncementsEnabled: preference.browserAnnouncementsEnabled,
      browserCommentsEnabled: preference.browserCommentsEnabled,
      browserGradesEnabled: preference.browserGradesEnabled
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
