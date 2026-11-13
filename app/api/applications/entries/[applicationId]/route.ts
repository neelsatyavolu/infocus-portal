import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireManager } from "@/src/server/applications/access";
import { updateApplicationMeta } from "@/src/server/applications/review";

type Context = { params: Promise<{ applicationId: string }> };

const schema = z.object({
  extensionUntil: z.string().datetime({ offset: true }).nullable().optional(),
  extensionNote: z.string().max(500).nullable().optional(),
  decisionMessage: z.string().max(2000).nullable().optional()
});

/** Extension and per-applicant decision message (EPs + super admin). */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { applicationId } = await params;
    await updateApplicationMeta(await requireManager(), applicationId, schema.parse(await request.json()));
    return ok({ saved: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
