import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import { SHOW_DESCRIPTION_MAX, SHOW_TITLE_MAX } from "@/src/lib/show-publication";
import {
  confirmShowPublication, initShowUpload, showPublicationState, ShowUploadError
} from "@/src/server/show-publishing";

const dateKey = z.string().regex(DATE_KEY_PATTERN);

const initSchema = z.object({
  action: z.literal("init"),
  showDate: dateKey,
  fileName: z.string().trim().min(1).max(255)
});

const confirmSchema = z.object({
  action: z.literal("confirm"),
  showDate: dateKey,
  title: z.string().trim().min(1).max(SHOW_TITLE_MAX).refine((value) => !/[<>]/.test(value), "No < or > in the title."),
  description: z.string().trim().max(SHOW_DESCRIPTION_MAX).refine((value) => !/[<>]/.test(value), "No < or > in the description."),
  publishDate: dateKey,
  publishTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  seasonNumber: z.number().int().min(1).max(999)
});

async function requireProducer() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
    throw new Error("FORBIDDEN");
  }
  return userId;
}

function routeError(error: unknown) {
  if (error instanceof ShowUploadError) return fail(error.message, error.status);
  return handleRouteError(error);
}

export async function GET(request: Request) {
  try {
    await requireProducer();
    const date = new URL(request.url).searchParams.get("date");
    if (!date || !DATE_KEY_PATTERN.test(date)) {
      return fail("A valid date is required.", 400);
    }
    return ok(await showPublicationState(date));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireProducer();
    const body = await request.json();
    if (body?.action === "init") {
      const payload = initSchema.parse(body);
      return ok(await initShowUpload({ userId, showDate: payload.showDate, fileName: payload.fileName }));
    }
    const { showDate, title, description, publishDate, publishTime, seasonNumber } = confirmSchema.parse(body);
    return ok(await confirmShowPublication({ userId, showDate, title, description, publishDate, publishTime, seasonNumber }));
  } catch (error) {
    return routeError(error);
  }
}
