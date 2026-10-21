import { fail, okNoStore } from "@/src/lib/http";
import { editorCaller } from "@/src/lib/show-editor-auth";
import { claimNextShowEdit } from "@/src/server/show-editor";
import { editorRouteError } from "@/src/server/show-editor-service";

export const dynamic = "force-dynamic";

/**
 * Hands the calling machine its next edit (with brief and Drive links): new edits only to the active
 * machine, fixes to the machine that made the edit (Bearer device token or SHOW_EDITOR_TOKEN).
 */
export async function POST(request: Request) {
  const caller = await editorCaller(request);
  if (!caller) return fail("Unauthorized", 401);
  try {
    return okNoStore((await claimNextShowEdit(caller.deviceId)) ?? { job: null });
  } catch (error) {
    return editorRouteError(error);
  }
}
