import { fail, okNoStore } from "@/src/lib/http";
import { startEditorLink } from "@/src/server/show-editor-link";
import { clientAddress, editorRateLimited } from "@/src/server/show-editor-rate-limit";
import { editorRouteError, linkStartSchema, readEditorBody } from "@/src/server/show-editor-service";

export const dynamic = "force-dynamic";

/** The Mac's setup app starts linking (no auth; public in middleware; rate-limited per address). */
export async function POST(request: Request) {
  if (editorRateLimited("link", clientAddress(request))) return fail("Too many tries. Wait a few minutes.", 429);
  try {
    return okNoStore(await startEditorLink(linkStartSchema.parse(await readEditorBody(request))));
  } catch (error) {
    return editorRouteError(error);
  }
}
