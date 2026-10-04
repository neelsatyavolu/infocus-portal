import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { createMeeting } from "@/src/server/meetings-edit";
import { listMeetings } from "@/src/server/meetings-schedule";

export const dynamic = "force-dynamic";

const createMeetingSchema = z.object({
  title: z.string().trim().min(1).max(120),
  startsAt: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  access: z.enum(["OPEN", "INVITE_ONLY", "EXECS_ONLY"]).optional(),
  inviteeUserIds: z.array(z.string().min(1).max(64)).max(200).optional()
});

export async function GET() {
  try {
    const viewer = await requireMeetingViewer();
    return ok(await listMeetings(viewer));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await requireMeetingViewer();
    const body = createMeetingSchema.parse(await request.json());
    const meeting = await createMeeting(viewer, {
      title: body.title,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      durationMinutes: body.durationMinutes,
      access: body.access,
      inviteeUserIds: body.inviteeUserIds
    });
    return ok({ meeting }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
