import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import { CallPlate } from "@/components/meetings/call/status-plate";
import { mainAppOrigin } from "@/src/lib/hosts";
import { meetingUrl, producersMeetingUrl } from "@/src/lib/meetings/links";
import { loadMeetingPreview } from "@/src/server/meetings-preview";

/**
 * Link-preview page for meeting links. Middleware rewrites `/meet/<id>` here only for preview
 * crawlers (iMessage, Slack, …). Its metadata carries the card (title, time and the image's
 * agenda); the page itself is the call's plate with the same title and time and a link in.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const preview = await loadMeetingPreview(id);
  const origin = mainAppOrigin().replace(/\/+$/, "");
  const url = id === "producers" ? producersMeetingUrl() : meetingUrl(id);
  return {
    metadataBase: new URL(origin),
    title: preview.title,
    description: preview.description,
    robots: { index: false, follow: false },
    openGraph: { title: preview.title, description: preview.description, url, siteName: "InFocus Portal", type: "website" },
    twitter: { card: "summary_large_image", title: preview.title, description: preview.description }
  };
}

export default async function MeetingPreviewPage({ params }: Props) {
  const { id } = await params;
  const preview = await loadMeetingPreview(id);
  return (
    <CallPlate
      eyebrow="Meeting"
      title={preview.title}
      body={preview.description}
      actions={
        <a href={id === "producers" ? producersMeetingUrl() : meetingUrl(id)} className={buttonVariants()}>
          Open in InFocus Portal
        </a>
      }
    />
  );
}
