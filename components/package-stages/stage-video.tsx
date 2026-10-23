"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MessageSquare, Play } from "lucide-react";
import { MediaBadge, MediaThumb } from "@/components/kit/media";
import { VideoPlayer } from "@/components/kit/video-player";
import { buttonVariants } from "@/components/ui/button";
import type { StageMediaCard } from "@/components/package-stages/types";
import { cn } from "@/src/lib/utils";

/** Review page for a cut; Initial Cut opens it bare (`?bare=1`), Final Cut does not. */
export function stageReviewHref(item: StageMediaCard, bare: boolean) {
  if (!item.projectId) return null;
  const path = `/projects/${item.projectId}/review/${item.id}`;
  return bare ? `${path}?bare=1` : path;
}

/** Comment count with a 16px icon (hidden at 0). */
export function CommentCount({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm text-muted-foreground", className)}>
      <MessageSquare aria-hidden className="h-4 w-4" />
      <span className="font-mono-broadcast tabular-nums">{count}</span>
      <span className="sr-only">{count === 1 ? "comment" : "comments"}</span>
    </span>
  );
}

/**
 * The stage's main video, playable in place (16:9, dark frame in both themes), with one meta row
 * under it: title, an optional status tag, comment count and an outline "Open review" link for timecoded notes.
 * Before the video can play, the thumbnail shows with a Processing (or Failed) mark. The picture
 * is at most min(62dvh, 36rem) tall: on wide Groups screens it sits centred in the full-width dark
 * frame (edges still line up) instead of filling the screen and pushing grading below the fold.
 */
export function StageVideo({
  item,
  title,
  status,
  reviewHref
}: {
  item: StageMediaCard;
  title: string;
  status?: ReactNode;
  reviewHref: string | null;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <div className="overflow-hidden rounded-md border border-border bg-black">
        <div className="mx-auto w-full max-w-[calc(min(62dvh,36rem)*16/9)]">
          {item.playbackUrl ? (
            <VideoPlayer
              key={item.versionId ?? item.id}
              src={item.playbackUrl}
              poster={item.thumbnailUrl}
              preload="none"
              label={title}
            />
          ) : (
            <MediaThumb
              src={item.thumbnailUrl}
              priority
              className="rounded-none"
              sizes="(min-width: 1024px) 60vw, 100vw"
              topLeft={<MediaBadge mono={false}>{item.status === "FAILED" ? "Failed" : "Processing"}</MediaBadge>}
            />
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="min-w-0 truncate text-base font-semibold text-foreground" title={title}>
          {title}
        </h3>
        {status}
        <CommentCount count={item.commentCount} />
        {reviewHref ? (
          <Link href={reviewHref as never} className={cn(buttonVariants({ variant: "outline" }), "ml-auto max-sm:h-10")}>
            <Play aria-hidden />
            Open review
          </Link>
        ) : null}
      </div>
    </div>
  );
}
