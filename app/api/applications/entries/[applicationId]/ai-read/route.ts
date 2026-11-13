import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireManager } from "@/src/server/applications/access";
import { runAiRead } from "@/src/server/applications/ai-read";

type Context = { params: Promise<{ applicationId: string }> };

/** Run the reference-only AI read for one submitted application. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { applicationId } = await params;
    return ok(await runAiRead(await requireManager(), applicationId));
  } catch (error) {
    return handleRouteError(error);
  }
}
