import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import {
  SEMESTER_RESET_CONFIRM,
  SemesterResetError,
  previewSemesterReset,
  resetSemester
} from "@/src/server/semester-reset";

export const maxDuration = 60;

const termSchema = z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)]));

const resetSchema = z
  .object({ term: termSchema, confirm: z.string() })
  .refine((body) => body.confirm === SEMESTER_RESET_CONFIRM[body.term], { message: "Confirmation text does not match." });

async function requireResetAccess() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!access.canManagePlatformRoles) {
    throw new Error("FORBIDDEN");
  }
  return userId;
}

/** GET ?term=1|2 — what a reset of that semester would remove, for the confirm dialog. */
export async function GET(request: Request) {
  try {
    await requireResetAccess();
    const parsed = termSchema.safeParse(new URL(request.url).searchParams.get("term"));
    if (!parsed.success) {
      throw new Error("BAD_REQUEST");
    }
    return ok(await previewSemesterReset(parsed.data));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST { term, confirm: "RESET S1" | "RESET S2" } — super admin and adviser only. */
export async function POST(request: Request) {
  try {
    const userId = await requireResetAccess();
    const parsed = resetSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new Error("BAD_REQUEST");
    }
    return ok(await resetSemester({ term: parsed.data.term, actorUserId: userId }));
  } catch (error) {
    if (error instanceof SemesterResetError) {
      return fail(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
