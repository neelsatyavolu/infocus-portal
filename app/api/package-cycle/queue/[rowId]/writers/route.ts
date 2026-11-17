import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { MAX_EXTRA_WRITERS, MAX_WRITER_NAME_LENGTH, parseWriterNames } from "@/src/lib/wordpress-story";
import { setExtraWriters } from "@/src/server/publishing-queue";

const schema = z.object({
  names: z.string().max(MAX_EXTRA_WRITERS * (MAX_WRITER_NAME_LENGTH + 2))
    .transform(parseWriterNames)
    .pipe(z.array(z.string().max(MAX_WRITER_NAME_LENGTH, "Each name can be up to 80 characters."))
      .max(MAX_EXTRA_WRITERS, `Add up to ${MAX_EXTRA_WRITERS} co-reporters.`))
});

/** Producers set a queued package's co-reporters, credited on its infocusnews.tv story only. */
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
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the names and try again.", 400);
    }
    return ok({ extraWriters: await setExtraWriters(rowId, parsed.data.names) });
  } catch (error) {
    return handleRouteError(error);
  }
}
