import { Suspense } from "react";
import { SharedSubmittedAnnouncements } from "@/components/shared-submitted-announcements";

export default function SharedSubmittedAnnouncementsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading submitted announcements…</p>}>
      <SharedSubmittedAnnouncements />
    </Suspense>
  );
}
