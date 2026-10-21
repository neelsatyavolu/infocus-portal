import { fail, okNoStore } from "@/src/lib/http";
import { editorCaller } from "@/src/lib/show-editor-auth";
import { recordHeartbeat } from "@/src/server/show-editor";
import { editorRouteError, heartbeatSchema, readEditorBody } from "@/src/server/show-editor-service";

export const dynamic = "force-dynamic";

/** Editing Mac → Portal every minute (Bearer device token or SHOW_EDITOR_TOKEN; public in middleware). */
export async function POST(request: Request) {
  const caller = await editorCaller(request);
  if (!caller) return fail("Unauthorized", 401);
  try {
    return okNoStore(await recordHeartbeat({ ...heartbeatSchema.parse(await readEditorBody(request)), deviceId: caller.deviceId }));
  } catch (error) {
    return editorRouteError(error);
  }
}
