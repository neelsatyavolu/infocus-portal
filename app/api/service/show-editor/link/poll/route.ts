import { fail, okNoStore } from "@/src/lib/http";
import { pollEditorLink } from "@/src/server/show-editor-link";
import { clientAddress, editorRateLimited } from "@/src/server/show-editor-rate-limit";
import { editorRouteError, linkPollSchema, readEditorBody } from "@/src/server/show-editor-service";

export const dynamic = "force-dynamic";

/**
 * The Mac polls every 5 seconds with its secret device code; once a producer approves, the token comes
 * back exactly once (no auth; public in middleware). A 15-minute link polled every 5 s is 180 calls, so
 * this route has its own, roomier per-address budget.
 */
export async function POST(request: Request) {
  if (editorRateLimited("link-poll", clientAddress(request), undefined, 240)) return fail("Too many tries. Wait a few minutes.", 429);
  try {
    return okNoStore(await pollEditorLink(linkPollSchema.parse(await readEditorBody(request))));
  } catch (error) {
    return editorRouteError(error);
  }
}
