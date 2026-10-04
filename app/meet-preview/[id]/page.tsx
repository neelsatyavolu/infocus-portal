import type { Metadata } from "next";
import { mainAppOrigin } from "@/src/lib/hosts";
import { loadMeetingPreview } from "@/src/server/meetings-preview";

/**
 * Link-preview page for meeting links. Middleware rewrites `/meet/<id>` here only for preview
 * crawlers (iMessage, Slack, …); it carries metadata and nothing else (title and time only).
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const preview = await loadMeetingPreview(id);
  const origin = mainAppOrigin().replace(/\/+$/, "");
  const url = `${origin}/meet/${encodeURIComponent(id)}`;
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
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>{preview.title}</h1>
      <p>
        <a href={`/meet/${encodeURIComponent(id)}`}>Open in InFocus Portal</a>
      </p>
    </main>
  );
}
