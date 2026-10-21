import { fail, okNoStore } from "@/src/lib/http";
import { isShowEditorRequest } from "@/src/lib/show-editor-auth";
import { reportShowEditProgress } from "@/src/server/show-editor";
import { editorRouteError, progressSchema, readEditorBody } from "@/src/server/show-editor-service";

export const dynamic = "force-dynamic";

/** Stage changes from the editing Mac; the answer says whether a producer cancelled (Bearer SHOW_EDITOR_TOKEN). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isShowEditorRequest(request))) return fail("Unauthorized", 401);
  try {
    const { id } = await params;
    const body = progressSchema.parse(await readEditorBody(request));
    return okNoStore(await reportShowEditProgress({ id, ...body }));
  } catch (error) {
    return editorRouteError(error);
  }
}
