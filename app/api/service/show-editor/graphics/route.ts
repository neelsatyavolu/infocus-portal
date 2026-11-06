import { fail, okNoStore } from "@/src/lib/http";
import { editorCaller } from "@/src/lib/show-editor-auth";
import { latestGraphicsSource } from "@/src/server/show-editor-graphics";
import { editorRouteError } from "@/src/server/show-editor-service";

export const dynamic = "force-dynamic";

/** Editing Mac → Portal before a job: the newest Graphics Source tarball, as a short-lived GitHub link. */
export async function POST(request: Request) {
  const caller = await editorCaller(request);
  if (!caller) return fail("Unauthorized", 401);
  try {
    return okNoStore(await latestGraphicsSource());
  } catch (error) {
    return editorRouteError(error);
  }
}
