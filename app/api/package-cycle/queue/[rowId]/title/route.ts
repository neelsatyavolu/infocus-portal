import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { CUSTOM_PACKAGE_TITLE_MAX_LENGTH } from "@/src/lib/publishing-queue";
import { setCustomPackageTitle } from "@/src/server/publishing-queue";

const schema = z.object({
  title: z.string().trim()
    .min(1, "Add a title.")
    .max(CUSTOM_PACKAGE_TITLE_MAX_LENGTH, `Keep the title to ${CUSTOM_PACKAGE_TITLE_MAX_LENGTH} characters or fewer.`)
    .refine((title) => !/[<>]/.test(title), "The title can't include < or >.")
});

/** Producers rename a custom (uploaded) queue package. */
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
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the title and try again.", 400);
    return ok({ title: await setCustomPackageTitle(rowId, parsed.data.title) });
  } catch (error) {
    return handleRouteError(error);
  }
}
