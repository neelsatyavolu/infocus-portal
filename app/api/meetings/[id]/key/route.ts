import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { getMeetingKeyForViewer } from "@/src/server/meetings-join";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await requireMeetingViewer();
    return okNoStore(await getMeetingKeyForViewer(viewer, id));
  } catch (error) {
    return handleRouteError(error);
  }
}
