import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { fail, ok } from "@/src/lib/http";
import { applyMeetingNotesUpdate, checkDriveCaller } from "@/src/server/meetings-service";

export const dynamic = "force-dynamic";

/** Drive Scribe → Portal notes status (Bearer DRIVE_SERVICE_TOKEN; public in middleware). */
const notesSchema = z.object({
  status: z.enum(["RECORDING", "PROCESSING", "READY", "FAILED"]),
  summaryMarkdown: z.string().max(200_000).optional(),
  drivePath: z.string().min(1).max(1024).optional(),
  /** Which Scribe session ("part", 1, 2, …) this is about; the start call says. Absent = the current one. */
  part: z.number().int().min(1).max(1000).optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = checkDriveCaller(request);
    if (caller === "unconfigured") return fail("Service token not configured", 503);
    if (caller === "denied") return fail("Unauthorized", 401);
    const { id } = await params;
    const body = notesSchema.parse(await request.json());
    return ok(await applyMeetingNotesUpdate(id, body));
  } catch (error) {
    return handleRouteError(error);
  }
}
