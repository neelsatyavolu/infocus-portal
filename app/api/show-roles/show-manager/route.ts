import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import { setShowManager } from "@/src/server/show-cast";
import { resolveShowManagers } from "@/src/server/show-manager";

const schema = z.object({
  date: z.string().regex(DATE_KEY_PATTERN),
  name: z.string().trim().max(80)
});

async function requireProducer() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
    throw new Error("FORBIDDEN");
  }
}

export async function GET(request: Request) {
  try {
    await requireProducer();
    const dateKey = new URL(request.url).searchParams.get("date");
    if (!dateKey || !DATE_KEY_PATTERN.test(dateKey)) {
      return fail("A valid date is required.", 400);
    }
    const resolved = await resolveShowManagers([dateKey]);
    return ok({
      date: dateKey,
      pool: resolved.pool,
      name: resolved.managers[dateKey]?.name ?? "",
      source: resolved.managers[dateKey]?.source ?? "rotation"
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireProducer();
    const payload = schema.parse(await request.json());
    return ok(await setShowManager(payload.date, payload.name));
  } catch (error) {
    return handleRouteError(error);
  }
}
