import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireReviewer } from "@/src/server/applications/access";
import { deleteNote } from "@/src/server/applications/review";

type Context = { params: Promise<{ noteId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { noteId } = await params;
    await deleteNote(await requireReviewer(), noteId);
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
