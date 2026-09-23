import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import {
  MAX_CYCLES_PER_SEMESTER,
  MIN_CYCLES_PER_SEMESTER,
  getProgramSettings,
  setCyclesPerSemester
} from "@/src/server/program-settings";

const payloadSchema = z.object({
  cyclesPerSemester: z.number().int().min(MIN_CYCLES_PER_SEMESTER).max(MAX_CYCLES_PER_SEMESTER)
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const settings = await getProgramSettings();

    return ok({
      cyclesPerSemester: settings.cyclesPerSemester,
      canEdit: hasPlatformRole(access.role, "EXECUTIVE_PRODUCER")
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    // Cycle count changes the shape of every grade, so it is executive-only.
    if (!hasPlatformRole(access.role, "EXECUTIVE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const payload = payloadSchema.parse(await request.json());
    const settings = await setCyclesPerSemester(payload.cyclesPerSemester);

    return ok({ cyclesPerSemester: settings.cyclesPerSemester });
  } catch (error) {
    return handleRouteError(error);
  }
}
