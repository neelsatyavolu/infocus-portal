import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { updateMeeting } from "@/src/server/meetings-edit";
import { getMeetingDetail } from "@/src/server/meetings-schedule";

export const dynamic = "force-dynamic";

const updateMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    quickAccess: z.boolean().optional(),
    notesEnabled: z.boolean().optional(),
    status: z.literal("CANCELED").optional(),
    inviteeUserIds: z.array(z.string().min(1).max(64)).max(200).optional()
  })
  .strict();

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const viewer = await requireMeetingViewer();
    return ok({ meeting: await getMeetingDetail(viewer, id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const viewer = await requireMeetingViewer();
    const body = updateMeetingSchema.parse(await request.json());
    const meeting = await updateMeeting(viewer, id, {
      ...body,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined
    });
    return ok({ meeting });
  } catch (error) {
    return handleRouteError(error);
  }
}
