"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { MediaThumb } from "@/components/kit/media";
import { useRememberedState } from "@/components/kit/remembered-state";
import { StatusTag } from "@/components/kit/status-tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { CommentCount, StageVideo, stageReviewHref } from "@/components/package-stages/stage-video";
import type { StageMediaCard } from "@/components/package-stages/types";
import { cutTileReviewStatus } from "@/src/lib/group-tile-status";
import { cn } from "@/src/lib/utils";

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function CutStatus({
  item,
  reviewStage,
  remainingExecutiveSignoffs
}: {
  item: StageMediaCard;
  reviewStage: 1 | 2 | 3 | null;
  remainingExecutiveSignoffs?: number;
}) {
  const status = cutTileReviewStatus({
    approvalStatus: item.approvalStatus,
    reviewStage,
    approvedInStage: item.approvedInStage,
    remainingExecutiveSignoffs
  });
  return <StatusTag tone={status.tone}>{status.label}</StatusTag>;
}

/**
 * Initial Cut versions: the newest plays in place with Open review (no tag: the stage bar and the
 * header already name its status), and earlier versions are compact rows with their own review
 * status (the newest two show by default; the rest fold behind "Show older versions", remembered
 * per browser).
 */
export function CutVersions({
  media,
  reviewStage,
  remainingExecutiveSignoffs
}: {
  /** Newest first. */
  media: StageMediaCard[];
  reviewStage: 1 | 2 | 3 | null;
  remainingExecutiveSignoffs?: number;
}) {
  const [showOlder, setShowOlder] = useRememberedState("package-stages:older-versions:v1", false, isBoolean);
  const [latest, ...earlier] = media;
  if (!latest) return null;
  const olderCount = Math.max(0, earlier.length - 1);
  const visibleEarlier = showOlder ? earlier : earlier.slice(0, 1);

  return (
    <div className="space-y-5">
      <StageVideo item={latest} title={latest.title} reviewHref={stageReviewHref(latest, true)} />
      {visibleEarlier.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
            Earlier versions
          </h3>
          <ul className="divide-y divide-border rounded-md border border-border">
            {visibleEarlier.map((item) => {
              const href = stageReviewHref(item, true);
              return (
                <li key={item.versionId ?? item.id} className="flex min-h-14 min-w-0 items-center gap-3 px-3 py-2">
                  <MediaThumb src={item.thumbnailUrl} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground sm:flex-1" title={item.title}>
                      {item.title}
                    </span>
                    <span className="flex min-w-0 items-center gap-3">
                      <CutStatus
                        item={item}
                        reviewStage={reviewStage}
                        remainingExecutiveSignoffs={remainingExecutiveSignoffs}
                      />
                      <CommentCount count={item.commentCount} />
                    </span>
                  </span>
                  {href ? (
                    <Link
                      href={href as never}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0 max-sm:h-10")}
                    >
                      Review
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {olderCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="max-sm:h-10"
              aria-expanded={showOlder}
              onClick={() => setShowOlder((open) => !open)}
            >
              <ChevronDown aria-hidden className={cn("transition-transform", showOlder && "rotate-180")} />
              {showOlder ? "Hide older versions" : `Show older versions (${olderCount})`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
