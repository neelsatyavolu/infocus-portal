import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { getApplicationsViewer } from "@/src/server/applications/access";
import { getMyApplication } from "@/src/server/applications/applicant";
import { getRoundOrThrow, roughCutPlayback } from "@/src/server/applications/rounds";

type Context = { params: Promise<{ roundId: string }> };

/** A short-lived playback URL for the rough cut, only for signed-in people who can see the round. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { roundId } = await params;
    const viewer = await getApplicationsViewer();
    await getMyApplication(viewer, roundId);
    const url = await roughCutPlayback(await getRoundOrThrow(roundId));
    return okNoStore({ url });
  } catch (error) {
    return handleRouteError(error);
  }
}
