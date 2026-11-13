import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireManager } from "@/src/server/applications/access";
import { saveRanking } from "@/src/server/applications/review";

type Context = { params: Promise<{ roundId: string }> };

const schema = z.object({
  picks: z.record(z.string().max(40), z.array(z.string().max(40)).max(50)),
  reasons: z.record(z.string().max(40), z.string().max(2000)),
  submit: z.boolean()
});

/** Save (and optionally submit) the signed-in exec's own order of applicants. */
export async function PUT(request: Request, { params }: Context) {
  try {
    const { roundId } = await params;
    const viewer = await requireManager();
    await saveRanking(viewer, roundId, schema.parse(await request.json()));
    return ok({ saved: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
