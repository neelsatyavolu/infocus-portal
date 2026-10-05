import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { assertCanSeeMeeting, requireMeetingViewer } from "@/src/server/meetings-access";
import { fetchMeetingTranscript } from "@/src/server/meetings-scribe";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await requireMeetingViewer();
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { notesStatus: true, notesDrivePaths: true, access: true, createdById: true, inviteeUserIds: true }
    });
    // INVITE_ONLY notes are only for the people on that meeting; EXECS_ONLY notes only for execs.
    assertCanSeeMeeting(viewer, meeting);
    // Any READY part has a transcript (a later part may still be recording); parts are joined in order.
    if (meeting.notesDrivePaths.length === 0 && meeting.notesStatus !== "READY") throw new Error("NOT_FOUND");
    const markdown = await fetchMeetingTranscript(id, meeting.notesDrivePaths);
    if (markdown === null) throw new Error("NOT_FOUND");
    return ok({ markdown });
  } catch (error) {
    return handleRouteError(error);
  }
}
