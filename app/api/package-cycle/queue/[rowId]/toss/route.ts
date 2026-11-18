import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { TOSS_MAX_LENGTH, tossError } from "@/src/lib/package-toss";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { setCustomPackageToss } from "@/src/server/publishing-queue";

const schema = z.object({ toss: z.string().max(TOSS_MAX_LENGTH * 2) });

/** Producers set the toss of a custom (uploaded) queue package. A blank toss clears it. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ rowId: string }> }
) {
  try {
    const { rowId } = await params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return fail(`Keep the toss to ${TOSS_MAX_LENGTH} characters or fewer.`, 400);
    const problem = parsed.data.toss.trim() ? tossError(parsed.data.toss) : null;
    if (problem) return fail(problem, 400);
    return ok({ toss: await setCustomPackageToss(rowId, parsed.data.toss) });
  } catch (error) {
    return handleRouteError(error);
  }
}
