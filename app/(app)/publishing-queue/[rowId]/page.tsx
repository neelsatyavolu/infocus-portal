import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { prisma } from "@/src/lib/prisma";
import { formatShowDateLabel, todayDateKey } from "@/src/lib/show-assignment";
import { requirePublishingViewer } from "@/src/server/publishing-access";
import { formatPublishedDate, youtubeStatusSentence, youtubeStatusView } from "../queue-view-model";
import { PublicationStatusPanel, PublishedDetails } from "./publication-details";

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
  const status = youtubeStatusView(publication?.status);
  const sentence = youtubeStatusSentence(publication?.status);
  // Same "today" as the queue API, so a package in Past shows reads "Aired".
  const airs = showDate ? `${showDate < todayDateKey() ? "Aired" : "Airs"} ${formatShowDateLabel(showDate)}` : null;

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Radio className="h-3 w-3" aria-hidden />
            Publishing Queue
          </>
        }
        status={<StatusTag tone={status.tone} srLabel="YouTube: ">{status.label}</StatusTag>}
        title={publication?.title || row.groupTopic || "Untitled package"}
        description={airs ?? "Show date not assigned"}
        actions={
          // Everyone who can see a publication (producers and website managers) can open the queue.
          <Link href="/publishing-queue" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft aria-hidden />
            Back to Publishing Queue
          </Link>
        }
      />
      {videoId ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="overflow-hidden rounded-md border border-border bg-[var(--ink-2)]">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              title={publication?.title || "Published package"}
              className="block aspect-video w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
          <PublishedDetails videoId={videoId} publishedOn={formatPublishedDate(publication?.publishedAt)} sentence={sentence} />
        </div>
      ) : (
        <PublicationStatusPanel status={status.key} sentence={sentence} />
      )}
    </div>
  );
}
