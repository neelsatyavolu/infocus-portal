import { fail, okNoStore } from "@/src/lib/http";
import { editorCaller } from "@/src/lib/show-editor-auth";
import { showEditUploadTargets } from "@/src/server/show-editor";
import { editorRouteError } from "@/src/server/show-editor-service";

export const dynamic = "force-dynamic";

/** Drive read/write tokens for this run's show file, poster and debug bundle, minted right before upload (Bearer SHOW_EDITOR_TOKEN). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await editorCaller(request);
  if (!caller) return fail("Unauthorized", 401);
  try {
    const { id } = await params;
    return okNoStore(await showEditUploadTargets(id, caller.deviceId));
  } catch (error) {
    return editorRouteError(error);
  }
}
