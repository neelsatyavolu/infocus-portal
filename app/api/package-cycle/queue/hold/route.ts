import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { QUEUE_HOLD_LABEL_MAX } from "@/src/lib/publishing-queue";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import { holdShowDay, releaseShowDay } from "@/src/server/publishing-queue-hold";

const holdSchema = z.object({
  date: z.string().regex(DATE_KEY_PATTERN),
  label: z.string().trim().min(1).max(QUEUE_HOLD_LABEL_MAX)
});

const releaseSchema = z.object({ date: z.string().regex(DATE_KEY_PATTERN) });

/** Same people who edit the calendar (Admin → Calendar days): EP, adviser, super admin. */
async function requireCalendarEditor(request: Request) {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!hasPlatformRole(access.role, "EXECUTIVE_PRODUCER")) throw new Error("FORBIDDEN");
  const rate = limitByKey(getRequestKey(request, "package-cycle:queue:hold"), { max: 40, windowMs: 60_000 });
  if (!rate.allowed) throw new Error("TOO_MANY_REQUESTS");
}

/** Hold a show day for a show without a file yet: it gets a calendar name and auto-assign skips it. */
export async function POST(request: Request) {
  try {
    await requireCalendarEditor(request);
    const payload = holdSchema.parse(await request.json());
    const row = await holdShowDay(payload.date, payload.label);
    return ok({ date: row.date, label: row.label });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Release a held (or any special) show day back to auto-assign. */
export async function DELETE(request: Request) {
  try {
    await requireCalendarEditor(request);
    const payload = releaseSchema.parse({ date: new URL(request.url).searchParams.get("date") });
    await releaseShowDay(payload.date);
    return ok({ date: payload.date, released: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
