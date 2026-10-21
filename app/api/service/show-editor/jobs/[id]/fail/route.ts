import { fail, okNoStore } from "@/src/lib/http";
import { isShowEditorRequest } from "@/src/lib/show-editor-auth";
import { failShowEdit } from "@/src/server/show-editor";
import { editorRouteError, failSchema, readEditorBody } from "@/src/server/show-editor-service";

export const dynamic = "force-dynamic";

/** The edit failed or was cancelled on the editing Mac (Bearer SHOW_EDITOR_TOKEN). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isShowEditorRequest(request))) return fail("Unauthorized", 401);
  try {
    const { id } = await params;
    const body = failSchema.parse(await readEditorBody(request));
    return okNoStore(await failShowEdit({ id, ...body }));
  } catch (error) {
    return editorRouteError(error);
  }
}
