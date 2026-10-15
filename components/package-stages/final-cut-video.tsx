"use client";

import { StatusTag } from "@/components/kit/status-tag";
import { StageVideo, stageReviewHref } from "@/components/package-stages/stage-video";
import type { StageMediaCard } from "@/components/package-stages/types";
import { cutTileReviewStatus } from "@/src/lib/group-tile-status";

/**
 * The Final Cut, playable in place, titled by its headline, with Open review (not bare). It always
 * carries its review status tag (Needs revisions / Approved / Pending review, from the version's
 * approval status on the review page), which the stage status (Submitted / Approved / Queued,
 * from the Final Cut and the queue) does not show.
 */
export function FinalCutVideo({
  media,
  reviewStage,
  remainingExecutiveSignoffs
}: {
  media: StageMediaCard[];
  reviewStage: 1 | 2 | 3 | null;
  remainingExecutiveSignoffs?: number;
}) {
  return (
    <div className="space-y-5">
      {media.map((item) => {
        const status = cutTileReviewStatus({
          approvalStatus: item.approvalStatus,
          reviewStage,
          approvedInStage: item.approvedInStage,
          remainingExecutiveSignoffs
        });
        return (
          <StageVideo
            key={item.versionId ?? item.id}
            item={item}
            title={item.title || "Final Cut"}
            status={<StatusTag tone={status.tone}>{status.label}</StatusTag>}
            reviewHref={stageReviewHref(item, false)}
          />
        );
      })}
    </div>
  );
}
