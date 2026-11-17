import { fail, okNoStore } from "@/src/lib/http";
import { editorCaller } from "@/src/lib/show-editor-auth";
import { latestIntros } from "@/src/server/show-editor-graphics";
import { editorRouteError } from "@/src/server/show-editor-service";

export const dynamic = "force-dynamic";

/** Editing Mac → Portal once a day: the newest intros tarball (every look's intro videos), as a short-lived GitHub link. */
export async function POST(request: Request) {
  const caller = await editorCaller(request);
  if (!caller) return fail("Unauthorized", 401);
  try {
    return okNoStore(await latestIntros());
  } catch (error) {
    return editorRouteError(error);
  }
}
