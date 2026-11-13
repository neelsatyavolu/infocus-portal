import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireManager } from "@/src/server/applications/access";
import { castVote } from "@/src/server/applications/review";

type Context = { params: Promise<{ applicationId: string }> };

const schema = z.object({ optionKey: z.string().max(40).nullable() });

/** The signed-in voter's final-decision pick (null clears it). */
export async function PUT(request: Request, { params }: Context) {
  try {
    const { applicationId } = await params;
    const { optionKey } = schema.parse(await request.json());
    await castVote(await requireManager(), applicationId, optionKey);
    return ok({ saved: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
