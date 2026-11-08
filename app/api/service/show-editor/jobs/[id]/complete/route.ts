import { fail, okNoStore } from "@/src/lib/http";
import { editorCaller } from "@/src/lib/show-editor-auth";
import { completeShowEdit } from "@/src/server/show-editor";
import { completeSchema, editorRouteError, readEditorBody } from "@/src/server/show-editor-service";

export const dynamic = "force-dynamic";

/** The edit is uploaded: it becomes the show's draft and waits for review (Bearer SHOW_EDITOR_TOKEN). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await editorCaller(request);
  if (!caller) return fail("Unauthorized", 401);
  try {
    const { id } = await params;
    const body = completeSchema.parse(await readEditorBody(request));
    return okNoStore(await completeShowEdit({ id, deviceId: caller.deviceId, ...body }));
  } catch (error) {
    return editorRouteError(error);
  }
}
