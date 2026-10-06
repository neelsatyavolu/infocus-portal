import type { Metadata } from "next";
import { redirect } from "next/navigation";
import MeetingNotesClient from "@/components/meetings/notes/meeting-notes-client";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { requireMeetingViewer, visibleMeetingWhere } from "@/src/server/meetings-access";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const viewer = await requireMeetingViewer();
    const meeting = await prisma.meeting.findFirst({
      where: { AND: [{ id }, visibleMeetingWhere(viewer)] },
      select: { title: true }
    });
    return { title: meeting?.title || "Meeting notes" };
  } catch {
    return { title: "Meeting notes" };
  }
}

export default async function MeetingNotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { platformRole } = await getCurrentAppUser();
  if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
    redirect("/access-denied");
  }
  const { id } = await params;
  return <MeetingNotesClient meetingId={id} />;
}
