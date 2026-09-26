import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { liveImageSchema, sanitizeGraphicFields } from "@/src/lib/live/graphics";
import { scoreboardActionSchema } from "@/src/lib/live/scoreboard";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { requireLiveAccess } from "@/src/server/live-access";
import { applyScoreboardActions, getLiveGraphics, saveLiveImage } from "@/src/server/live-graphics";

type RouteContext = { params: Promise<{ eventId: string }> };

const postSchema = z.union([
  z.object({ actions: z.array(scoreboardActionSchema).min(1).max(50) }),
  z.object({ liveImage: liveImageSchema })
]);

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireLiveAccess();
    const { eventId } = await context.params;
    return okNoStore(await getLiveGraphics(eventId));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** { actions } updates the scoreboard; { liveImage } pushes or clears the Live image. */
export async function POST(request: Request, context: RouteContext) {
  try {
    await requireLiveAccess();
    const limit = limitByKey(getRequestKey(request, "live:state"), { max: 600, windowMs: 60_000 });
    if (!limit.allowed) throw new Error("TOO_MANY_REQUESTS");
    const { eventId } = await context.params;
    const body = postSchema.parse(await request.json());
    if ("actions" in body) return okNoStore(await applyScoreboardActions(eventId, body.actions));
    const liveImage =
      body.liveImage === null
        ? null
        : { ...body.liveImage, fields: sanitizeGraphicFields(body.liveImage.graphic, body.liveImage.fields), pushedAt: Date.now() };
    return okNoStore(await saveLiveImage(eventId, liveImage));
  } catch (error) {
    return handleRouteError(error);
  }
}
