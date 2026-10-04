import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { endMeetingAsHost } from "@/src/server/meetings-moderation";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await requireMeetingViewer();
    return ok(await endMeetingAsHost(viewer, id));
  } catch (error) {
    return handleRouteError(error);
  }
}
