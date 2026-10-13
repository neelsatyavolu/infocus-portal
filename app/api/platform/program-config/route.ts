import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { orderSchoolYears, schoolYearSchema } from "@/src/lib/program-config";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { getProgramConfig, updateProgramConfig } from "@/src/server/program-settings";
import { applySchoolYears } from "@/src/server/school-calendar-sync";

const payloadSchema = z.object({
  schoolYears: z.array(schoolYearSchema).min(1).max(12)
});

/** Admin → Configuration is for executive producers, the adviser and super admin. */
async function requireConfigAccess() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!access.canManageAccounts && !access.isExecutiveProducer && !access.isAdviser) {
    throw new Error("FORBIDDEN");
  }
}

export async function GET() {
  try {
    await requireConfigAccess();
    return ok(await getProgramConfig());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireConfigAccess();

    const rate = limitByKey(getRequestKey(request, "platform:program-config:write"), { max: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = payloadSchema.safeParse(await request.json());
    if (!payload.success) {
      return fail(payload.error.issues[0]?.message ?? "Check the school year dates.", 400);
    }

    let schoolYears;
    try {
      // Saving a year confirms it, including one the Portal read from Paly's calendar.
      schoolYears = orderSchoolYears(payload.data.schoolYears.map((year) => ({ ...year, source: "manual" as const })));
    } catch {
      return fail("Two school years overlap. Each year must start after the one before it ends.", 400);
    }

    const config = await updateProgramConfig({ schoolYears });
    await applySchoolYears(schoolYears);
    return ok(config);
  } catch (error) {
    return handleRouteError(error);
  }
}
