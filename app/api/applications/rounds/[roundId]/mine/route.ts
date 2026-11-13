import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { getApplicationsViewer } from "@/src/server/applications/access";
import { saveDraft, submitApplication, unsubmitApplication } from "@/src/server/applications/applicant";

type Context = { params: Promise<{ roundId: string }> };

const draftSchema = z.object({ answers: z.unknown(), attested: z.boolean() });
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit"), answers: z.unknown(), attested: z.boolean() }),
  z.object({ action: z.literal("unsubmit") })
]);

/** Autosave the signed-in applicant's own draft. */
export async function PUT(request: Request, { params }: Context) {
  try {
    const { roundId } = await params;
    const viewer = await getApplicationsViewer();
    const input = draftSchema.parse(await request.json());
    return ok(await saveDraft(viewer, roundId, input));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Submit or unsubmit the signed-in applicant's own application (deadline enforced here). */
export async function POST(request: Request, { params }: Context) {
  try {
    const { roundId } = await params;
    const viewer = await getApplicationsViewer();
    const input = actionSchema.parse(await request.json());
    if (input.action === "unsubmit") {
      await unsubmitApplication(viewer, roundId);
      return ok({ status: "DRAFT" });
    }
    return ok(await submitApplication(viewer, roundId, input));
  } catch (error) {
    return handleRouteError(error);
  }
}
