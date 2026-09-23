import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { formatShowDateLabel } from "@/src/lib/show-assignment";
import { youtubeEmbedCode, youtubeWatchUrl } from "@/src/lib/youtube-publication";
import { requirePublishingViewer } from "@/src/server/publishing-access";
import PublicationEmbed from "../publication-embed";

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
      {hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER") ? (
        <Link href="/publishing-queue" className="text-sm text-muted-foreground hover:text-foreground">Back to Publishing Queue</Link>
      ) : null}
      <header className="space-y-2">
        <h1 className="display-md">{publication?.title || row.groupTopic || "Untitled package"}</h1>
        <p className="text-sm text-muted-foreground">{showDate ? formatShowDateLabel(showDate) : "Show date not assigned"}</p>
        <p className="text-sm" role="status">{status}</p>
      </header>
      {videoId ? (
        <>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title={publication?.title || "Published package"}
            className="aspect-video w-full rounded-xl border-0"
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
