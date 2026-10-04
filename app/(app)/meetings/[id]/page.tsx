import { redirect } from "next/navigation";
import MeetingNotesClient from "@/components/meetings/notes/meeting-notes-client";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";

export default async function MeetingNotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { platformRole } = await getCurrentAppUser();
  if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
    redirect("/access-denied");
  }
  const { id } = await params;
  return <MeetingNotesClient meetingId={id} />;
}
