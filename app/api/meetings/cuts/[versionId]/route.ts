import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { getMeetingCut } from "@/src/server/meetings-cuts";

export const dynamic = "force-dynamic";

const versionIdSchema = z.string().min(1).max(128);

type Context = { params: Promise<{ versionId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    await requireMeetingViewer();
    const { versionId } = await params;
    return ok(await getMeetingCut(versionIdSchema.parse(versionId)));
  } catch (error) {
    return handleRouteError(error);
  }
}
