import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireManager } from "@/src/server/applications/access";
import { setRelease } from "@/src/server/applications/review";

type Context = { params: Promise<{ roundId: string }> };

const schema = z.object({ releaseAt: z.string().datetime({ offset: true }).nullable() });

/** Freeze majority decisions and set when applicants see them; null cancels the release. */
export async function PUT(request: Request, { params }: Context) {
  try {
    const { roundId } = await params;
    const viewer = await requireManager();
    const { releaseAt } = schema.parse(await request.json());
    await setRelease(viewer, roundId, releaseAt ? new Date(releaseAt) : null);
    return ok({ saved: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
