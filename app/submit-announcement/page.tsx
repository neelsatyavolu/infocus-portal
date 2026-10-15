import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { AnnouncementSubmitForm } from "@/components/announcement-submit-form";
import { PageHeader } from "@/components/page-header";
import { PublicFrame } from "@/components/public-entry/public-frame";

export const metadata: Metadata = { title: "Submit an announcement" };

export default function SubmitAnnouncementPage() {
  return (
    <PublicFrame width="wide">
      <PageHeader
        eyebrow={
          <>
            <Megaphone className="h-3.5 w-3.5" aria-hidden />
            InFocus · Schoology
          </>
        }
        title="Submit an announcement"
        description="Anyone can request an announcement for InFocus and the Friday Schoology update. InFocus reviews every request before it airs."
      />
      <AnnouncementSubmitForm />
    </PublicFrame>
  );
}
