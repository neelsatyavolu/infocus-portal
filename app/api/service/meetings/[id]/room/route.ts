import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { fail, ok } from "@/src/lib/http";
import { checkRoomCaller, handleMeetingRoomReport } from "@/src/server/meetings-service";

export const dynamic = "force-dynamic";

/** meeting-room Worker → Portal (Bearer internal token signed "room"; public in middleware). */
const reportSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("started") }),
  z.object({ t: z.literal("knock"), uid: z.string().min(1).max(64), name: z.string().max(120) }),
  z.object({ t: z.literal("empty") }),
  z.object({ t: z.literal("hostPromoted"), uid: z.string().min(1).max(64) })
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await checkRoomCaller(request, id);
    if (caller === "unconfigured") return fail("Meetings are not configured", 503);
    if (caller === "denied") return fail("Unauthorized", 401);
    const report = reportSchema.parse(await request.json());
    return ok(await handleMeetingRoomReport(id, report));
  } catch (error) {
    return handleRouteError(error);
  }
}
