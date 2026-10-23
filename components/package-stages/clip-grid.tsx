"use client";

import { MessageSquare } from "lucide-react";
import { MediaBadge, MediaTile } from "@/components/kit/media";
import { StatusTag } from "@/components/kit/status-tag";
import { VideoPlayer } from "@/components/kit/video-player";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StageComments } from "@/components/package-cycle/stage-comments";
import { mediaStatusLabel } from "@/components/package-stages/stage-status";
import type { StageMediaCard } from "@/components/package-stages/types";
import { rollKindLabel } from "@/src/lib/package-roll-kind";
import { cn } from "@/src/lib/utils";

/** Nothing for a ready clip; Processing / Uploading with a spinner; Failed in Danger. */
function ClipStatus({ status }: { status: string }) {
  if (status === "READY") return null;
  if (status === "FAILED") return <StatusTag tone="danger">Failed</StatusTag>;
  const busy = status === "PROCESSING" || status === "UPLOADING";
  return (
    <StatusTag tone="neutral" spinner={busy}>
      {mediaStatusLabel(status)}
    </StatusTag>
  );
}

const GROUPS = [
  { key: "a-roll", label: "A-roll" },
  { key: "b-roll", label: "B-roll" },
  { key: "other", label: "Other" }
] as const;

/**
 * A-roll/B-roll clips grouped under A-ROLL / B-ROLL (older unlabeled clips under OTHER), as
 * equal-height tiles: thumbnail with the roll tag, note count and (for producers) NEW with the
 * green "new" edge, then a one-line title with a tag only when the clip isn't ready. Columns
 * follow the panel's own width (container queries), not the window. A tile opens the watch dialog.
 */
export function ClipGrid({
  media,
  showNew,
  wide = false,
  onWatch
}: {
  media: StageMediaCard[];
  /** Producers: mark clips uploaded after the latest revision request. */
  showNew: boolean;
  /** Wide route (Groups): up to 5 columns. */
  wide?: boolean;
  onWatch: (item: StageMediaCard) => void;
}) {
  return (
    <div className="@container space-y-5">
      {GROUPS.map((group) => {
        const items = media.filter((item) => (item.rollKind ?? "other") === group.key);
        if (items.length === 0) return null;
        return (
          <section key={group.key} aria-label={group.label} className="space-y-2">
            <h3 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
              {group.label}
              <span className="font-mono-broadcast tabular-nums">{items.length}</span>
            </h3>
            <ul className={cn("grid grid-cols-2 gap-3 @md:grid-cols-3 @3xl:grid-cols-4", wide && "@5xl:grid-cols-5")}>
              {items.map((item) => {
                const isNew = showNew && Boolean(item.isNew);
                return (
                  <li key={item.versionId ?? item.id} className="min-w-0">
                    <MediaTile
                      thumbnailUrl={item.thumbnailUrl}
                      title={item.title}
                      status={<ClipStatus status={item.status} />}
                      highlight={isNew ? "new" : undefined}
                      onClick={() => onWatch(item)}
                      sizes="(min-width: 1280px) 20vw, (min-width: 640px) 33vw, 50vw"
                      topLeft={
                        item.rollKind ? <MediaBadge mono={false}>{rollKindLabel(item.rollKind)}</MediaBadge> : null
                      }
                      topRight={
                        item.commentCount > 0 ? (
                          <MediaBadge>
                            <MessageSquare aria-hidden className="h-3 w-3" />
                            {item.commentCount}
                            <span className="sr-only">{item.commentCount === 1 ? "note" : "notes"}</span>
                          </MediaBadge>
                        ) : null
                      }
                      bottomLeft={
                        isNew ? (
                          <span title="Uploaded after the latest revision request" className="flex">
                            <MediaBadge mono={false}>
                              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--brand-green)]" />
                              New
                            </MediaBadge>
                          </span>
                        ) : null
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Watch one clip: the video beside "Feedback on this clip" (stacked on phones, where the dialog
 * fills the screen). Closing it reloads the stage quietly so note counts update.
 */
export function WatchClipDialog({
  clip,
  rowId,
  canComment,
  onClose,
  onPosted
}: {
  clip: StageMediaCard | null;
  rowId: string;
  canComment: boolean;
  onClose: () => void;
  onPosted: () => void;
}) {
  return (
    <Dialog
      open={Boolean(clip)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-5xl max-sm:h-dvh max-sm:max-h-dvh max-sm:w-screen max-sm:content-start max-sm:rounded-none max-sm:border-0">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="truncate">{clip?.title ?? "Clip"}</DialogTitle>
          <DialogDescription>{clip?.rollKind ? rollKindLabel(clip.rollKind) : "A-roll/B-roll"}</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            {clip?.playbackUrl ? (
              <VideoPlayer key={clip.id} src={clip.playbackUrl} label={clip.title} preload="auto" className="rounded-md" />
            ) : (
              <div className="grid aspect-video w-full place-items-center rounded-md bg-black px-4 text-center text-sm text-[var(--soft-white)]/70">
                This clip is not ready to play yet.
              </div>
            )}
          </div>
          {clip ? (
            <StageComments
              rowId={rowId}
              stage="a-roll"
              canWrite={canComment}
              mediaItemId={clip.id}
              className="min-w-0 lg:max-h-[min(70dvh,40rem)] lg:overflow-y-auto lg:pr-1"
              onPosted={onPosted}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
