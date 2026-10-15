import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { prisma } from "@/src/lib/prisma";
import { formatShowDateLabel } from "@/src/lib/show-assignment";
import { youtubeEmbedCode, youtubeWatchUrl } from "@/src/lib/youtube-publication";
import { requirePublishingViewer } from "@/src/server/publishing-access";
import PublicationEmbed from "../publication-embed";

export async function generateMetadata({ params }: { params: Promise<{ rowId: string }> }): Promise<Metadata> {
  const { rowId } = await params;
  try {
    const { userId, platformRole } = await getCurrentAppUser();
    await requirePublishingViewer(userId, platformRole);
    const row = await prisma.packageProgressRow.findUnique({
      where: { id: rowId },
      select: { groupTopic: true, youtubePublication: { select: { title: true } } }
    });
    return { title: row?.youtubePublication?.title || row?.groupTopic || "Publication" };
  } catch {
    return { title: "Publication" };
  }
}

export default async function PublicationPage({ params }: { params: Promise<{ rowId: string }> }) {
  const { userId, platformRole } = await getCurrentAppUser();
  try {
    await requirePublishingViewer(userId, platformRole);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/access-denied");
    throw error;
  }
  const { rowId } = await params;
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: rowId },
    select: {
      groupTopic: true,
      queuedForShowDate: true,
      youtubePublication: {
        select: { title: true, showDate: true, status: true, videoId: true, publishedAt: true }
      }
    }
  });
  if (!row) notFound();
  const publication = row.youtubePublication;
  const showDate = publication?.showDate ?? row.queuedForShowDate;
  const videoId = publication?.status === "PUBLISHED" && publication.videoId && /^[A-Za-z0-9_-]{11}$/.test(publication.videoId)
    ? publication.videoId : null;
  const status = publication?.status === "FAILED" ? "Publishing failed. Contact a producer for help."
    : publication?.status === "UPLOADING" ? "Uploading to YouTube…"
    : publication?.status === "PROCESSING" ? "YouTube is processing this video."
    : publication?.status === "PUBLISHED" ? "Published on YouTube"
    : "This package has not been published to YouTube yet.";

  return (
    <div className="route-enter mx-auto w-full max-w-3xl space-y-5 pb-24">
      <PageHeader
        eyebrow="Publishing Queue"
        title={publication?.title || row.groupTopic || "Untitled package"}
        description={
          <>
            {showDate ? formatShowDateLabel(showDate) : "Show date not assigned"} ·{" "}
            <span role="status">{status}</span>
          </>
        }
        actions={
          // Everyone who can see a publication (producers and website managers) can open the queue.
          <Link href="/publishing-queue" className={buttonVariants({ size: "sm", variant: "ghost" })}>
            Back to Publishing Queue
          </Link>
        }
      />
      {videoId ? (
        <>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title={publication?.title || "Published package"}
            className="aspect-video w-full rounded-md border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
          <a href={youtubeWatchUrl(videoId)} target="_blank" rel="noopener noreferrer" className="inline-block text-sm underline">Watch on YouTube</a>
          <PublicationEmbed code={youtubeEmbedCode(videoId)} />
        </>
      ) : null}
    </div>
  );
}
