import type { Metadata } from "next";
import { Suspense } from "react";
import { Megaphone } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { AnnouncementListSkeleton } from "@/components/public-entry/announcement-list-skeleton";
import { PublicFrame } from "@/components/public-entry/public-frame";
import { SharedSubmittedAnnouncements } from "@/components/shared-submitted-announcements";

export const metadata: Metadata = { title: "Submitted announcements" };

export default function SharedSubmittedAnnouncementsPage() {
  return (
    <PublicFrame width="wide">
      <PageHeader
        eyebrow={
          <>
            <Megaphone className="h-3.5 w-3.5" aria-hidden />
            InFocus · Shared view
          </>
        }
        status={<StatusTag tone="neutral">Read-only</StatusTag>}
        title="Submitted announcements"
        description="Announcements requested for InFocus and Schoology. Copy one, or a whole section."
      />
      <Suspense fallback={<AnnouncementListSkeleton />}>
        <SharedSubmittedAnnouncements />
      </Suspense>
    </PublicFrame>
  );
}
