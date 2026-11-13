import { fail, okNoStore } from "@/src/lib/http";
import { editorCaller } from "@/src/lib/show-editor-auth";
import { packageZips } from "@/src/server/show-editor-packages";
import { editorRouteError } from "@/src/server/show-editor-service";

export const dynamic = "force-dynamic";

/** Editing Mac → Portal once a day: the package zips on Drive (regular look and seasonal themes) with download links. */
export async function POST(request: Request) {
  const caller = await editorCaller(request);
  if (!caller) return fail("Unauthorized", 401);
  try {
    return okNoStore(await packageZips());
  } catch (error) {
    return editorRouteError(error);
  }
}
