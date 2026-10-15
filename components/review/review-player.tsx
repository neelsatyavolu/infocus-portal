"use client";

import Image from "next/image";
import type { MouseEvent, RefObject } from "react";
import { AlertTriangle, Film, Image as ImageIcon, Loader2, Pause, Play, RotateCw, UploadCloud, Volume2, VolumeX } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { MediaRange } from "@/components/media-range";
import { PlayheadSeekRange, PlayheadTimecode } from "@/components/review-playhead";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PLAYBACK_RATES, type ReviewPlayback } from "@/components/review/use-review-playback";
import type { CommentThread, ReviewVersion } from "@/components/review/comment-utils";
import { initialsFor } from "@/components/kit/avatar";
import { formatTimecode } from "@/src/lib/timecode";
import { cn } from "@/src/lib/utils";

// Below the split, in portrait, the page scrolls: the player pins under the app's top bar
// (--app-header-h; just the safe area on bare and guest pages), under dialogs and popovers (z-50
// and up), and follows an on-screen keyboard. While a phone keyboard is up the visual viewport has
// panned past the top bar, so the player pins to the very top then.
const PINNED_PLAYER_CLASS = cn(
  "max-lg:portrait:sticky max-lg:portrait:z-[45]",
  "max-lg:portrait:top-[calc(var(--review-vv-top,0px)_+_max(var(--app-header-h,0px),env(safe-area-inset-top)))]",
  "pointer-coarse:max-lg:portrait:group-has-[[data-review-composer]:focus]/review:top-[calc(var(--review-vv-top,0px)_+_env(safe-area-inset-top))]"
);
// On a phone the controls step aside while the composer has focus, so the frame and the keyboard both fit.
const HIDE_WHILE_COMPOSING_CLASS = "pointer-coarse:max-lg:portrait:group-has-[[data-review-composer]:focus]/review:hidden";
const OVERLAY_PLATE_CLASS =
  "absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md bg-black/60 text-[var(--soft-white)]";

type Pin = { xPct: number; yPct: number };

function markerTitle(number: number, thread: CommentThread) {
  const resolved = thread.root.resolvedAt !== null ? " · Resolved" : "";
  return `#${number} · ${thread.root.authorName} · ${formatTimecode(thread.root.timeSeconds)}${resolved}`;
}

function NotReady({
  version,
  isImageReview,
  canUploadVersion,
  onCheckAgain
}: {
  version: ReviewVersion | undefined;
  isImageReview: boolean;
  canUploadVersion: boolean;
  onCheckAgain: () => void;
}) {
  const checkAgain = (
    <Button type="button" variant="outline" onClick={onCheckAgain}>
      <RotateCw aria-hidden />
      Check again
    </Button>
  );
  let body;
  if (isImageReview) {
    body = <EmptyState icon={ImageIcon} title="Image preview is not available yet." />;
  } else if (version?.status === "FAILED") {
    body = (
      <EmptyState
        role="alert"
        tone="danger"
        icon={AlertTriangle}
        title="This upload failed."
        description={canUploadVersion ? "Upload a new version from the project." : "Ask the project's editors to upload it again."}
      />
    );
  } else if (version?.status === "UPLOADING") {
    body = <EmptyState icon={UploadCloud} title="Uploading…" description="Refresh to check again." action={checkAgain} />;
  } else if (version?.status === "READY") {
    body = <EmptyState icon={Film} title="This video couldn't load." description="Try again in a moment." action={checkAgain} />;
  } else {
    body = <EmptyState icon={Film} title="Processing…" description="Refresh to check again." action={checkAgain} />;
  }
  return (
    <div className="grid aspect-video min-h-48 w-full place-items-center rounded-md border border-dashed border-border bg-[var(--ink-2)]">
      {body}
    </div>
  );
}

/**
 * The picture and its control bar: the video (or image with pins) on a black 16:9 stage, comment
 * markers above the seek bar (with downloaded ranges), then play/pause, volume, timecode and speed.
 * Image pins are placed in the 16:9 box (letterbox included), exactly as they were saved. In the
 * desktop split the card fills its column (same bottom edge as the comments panel) and the stage
 * sits centered in it, like a viewer.
 */
export function ReviewPlayer({
  version,
  title,
  isImageReview,
  playback,
  timelineDuration,
  timeline,
  numbers,
  selectedCommentId,
  allowComment,
  composerPin,
  mediaStageMaxWidthPx,
  canUploadVersion,
  refs,
  onCanvasClick,
  onFocusThread,
  onCheckAgain
}: {
  version: ReviewVersion | undefined;
  title: string;
  isImageReview: boolean;
  playback: ReviewPlayback;
  timelineDuration: number;
  timeline: CommentThread[];
  numbers: Map<string, number>;
  selectedCommentId: string | null;
  allowComment: boolean;
  composerPin: Pin | null;
  mediaStageMaxWidthPx: number | null;
  canUploadVersion: boolean;
  refs: {
    card: RefObject<HTMLDivElement | null>;
    stage: RefObject<HTMLDivElement | null>;
    controls: RefObject<HTMLDivElement | null>;
    video: RefObject<HTMLVideoElement | null>;
    canvas: RefObject<HTMLDivElement | null>;
  };
  onCanvasClick: (event: MouseEvent<HTMLDivElement>) => void;
  onFocusThread: (thread: CommentThread) => void;
  onCheckAgain: () => void;
}) {
  const { isPlaying, isBuffering, playheadStore, bufferedStore, volume, setVolume, playbackRate, setPlaybackRate, seekTo, togglePlayback } =
    playback;

  let stageContent;
  if (isImageReview && version?.imageUrl) {
    stageContent = (
      <div
        ref={refs.canvas}
        className="relative overflow-hidden rounded-md border border-border bg-black max-lg:portrait:rounded-none max-lg:portrait:border-0"
        onClick={onCanvasClick}
      >
        <Image
          src={version.imageUrl}
          alt={title}
          width={1920}
          height={1080}
          className="aspect-video w-full object-contain"
          draggable={false}
          unoptimized
        />
        <div className="pointer-events-none absolute inset-0 z-20">
          {timeline.map((thread) => {
            if (thread.root.xPct === null || thread.root.yPct === null) {
              return null;
            }
            const selected = selectedCommentId === thread.root.id;
            const number = numbers.get(thread.root.id) ?? 0;
            return (
              <button
                key={thread.root.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onFocusThread(thread);
                }}
                title={`Comment #${number}${thread.root.resolvedAt !== null ? " · Resolved" : ""}`}
                aria-label={`Comment ${number} by ${thread.root.authorName}`}
                className={cn(
                  "pointer-events-auto absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[10px] font-semibold transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] pointer-coarse:h-8 pointer-coarse:w-8",
                  // Selected: InFocus Green with Soft White. Resolved: hollow and dashed, so it
                  // doesn't rely on color alone.
                  selected
                    ? "border-[var(--soft-white)] bg-[var(--brand-fill)] text-[var(--on-brand)]"
                    : thread.root.resolvedAt !== null
                      ? "border-dashed border-[var(--soft-white)] bg-black/60 text-[var(--soft-white)]"
                      : "border-black/40 bg-[var(--soft-white)] text-black"
                )}
                style={{ left: `${thread.root.xPct}%`, top: `${thread.root.yPct}%` }}
              >
                {initialsFor(thread.root.authorName).slice(0, 2)}
              </button>
            );
          })}
          {allowComment && composerPin ? (
            <div
              aria-hidden
              className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--brand-green)] bg-[var(--brand-green)]/40"
              style={{ left: `${composerPin.xPct}%`, top: `${composerPin.yPct}%` }}
            />
          ) : null}
        </div>
      </div>
    );
  } else if (!isImageReview && version?.playbackUrl) {
    stageContent = (
      <>
        <div className="relative overflow-hidden rounded-md border border-border bg-black max-lg:portrait:rounded-none max-lg:portrait:border-0">
          <video
            key={version.id}
            ref={refs.video}
            className="aspect-video w-full cursor-pointer bg-black"
            onClick={() => void togglePlayback()}
            playsInline
            preload="auto"
            poster={version.thumbnailUrl ?? undefined}
          />
          {isBuffering ? (
            <div role="status" aria-label="Loading video" className={cn(OVERLAY_PLATE_CLASS, "pointer-events-none")}>
              <Loader2 className="h-7 w-7 motion-safe:animate-spin" aria-hidden />
            </div>
          ) : !isPlaying ? (
            <button
              type="button"
              aria-label="Play"
              onClick={() => void togglePlayback()}
              className={cn(OVERLAY_PLATE_CLASS, "transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]")}
            >
              <Play className="ml-0.5 h-7 w-7 fill-current" aria-hidden />
            </button>
          ) : null}
        </div>

        <div ref={refs.controls} className={cn("mt-2 px-1 sm:px-2 max-lg:portrait:mt-1", HIDE_WHILE_COMPOSING_CLASS)}>
          {/* Markers sit in their own lane above the track so they never block scrubbing. On touch
              each marker's 40px hit area is a pseudo-element, so the lane stays 24px tall. */}
          <div className="relative h-6 lg:pointer-fine:h-4">
            {timeline.map((thread) => {
              const number = numbers.get(thread.root.id) ?? 0;
              const left = `${Math.max(0, Math.min(100, (thread.root.timeSeconds / Math.max(timelineDuration, 1)) * 100))}%`;
              const selected = selectedCommentId === thread.root.id;
              const resolved = thread.root.resolvedAt !== null;
              return (
                <button
                  key={thread.root.id}
                  type="button"
                  onClick={() => onFocusThread(thread)}
                  title={markerTitle(number, thread)}
                  aria-label={`Comment ${number} by ${thread.root.authorName} at ${formatTimecode(thread.root.timeSeconds)}${resolved ? ", resolved" : ""}`}
                  className="group/marker absolute top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:before:absolute pointer-coarse:before:-inset-2 pointer-coarse:before:rounded-full lg:pointer-fine:h-4 lg:pointer-fine:w-4"
                  style={{ left, zIndex: selected ? 2 : 1 }}
                >
                  <span
                    className={cn(
                      "block rounded-full transition-transform group-hover/marker:scale-150",
                      selected
                        ? "h-2.5 w-2.5 bg-[var(--brand-green)] ring-2 ring-foreground/80"
                        : resolved
                          ? "h-2 w-2 border border-muted-foreground bg-transparent"
                          : "h-2 w-2 bg-foreground"
                    )}
                  />
                </button>
              );
            })}
          </div>

          <PlayheadSeekRange
            playhead={playheadStore}
            buffered={bufferedStore}
            max={timelineDuration}
            onSeek={seekTo}
            // A pinned phone player keeps to about 300px tall, so the comments below it stay readable.
            className="max-lg:portrait:pointer-coarse:h-8"
          />

          <div className="mt-1 flex items-center gap-1 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 pointer-coarse:h-10 pointer-coarse:w-10"
              onClick={() => void togglePlayback()}
              aria-label={isPlaying ? "Pause" : "Play"}
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? <Pause aria-hidden /> : <Play aria-hidden />}
            </Button>
            <div className="hidden items-center gap-2 sm:flex">
              {volume === 0 ? (
                <VolumeX className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <MediaRange value={volume} max={1} step={0.01} label="Volume" onChange={setVolume} className="w-16 md:w-20" />
            </div>
            <span className="ml-1 whitespace-nowrap font-mono-broadcast text-xs tabular-nums text-muted-foreground">
              <span className="text-foreground">
                <PlayheadTimecode playhead={playheadStore} />
              </span>{" "}
              / {formatTimecode(timelineDuration)}
            </span>
            <span className="flex-1" />
            <Select value={String(playbackRate)} onValueChange={(value) => setPlaybackRate(Number(value))}>
              <SelectTrigger
                aria-label="Playback speed"
                className="h-8 w-auto gap-1 border-0 bg-transparent px-2 text-xs tabular-nums hover:bg-[var(--ink-3)] pointer-coarse:h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top" align="end">
                {PLAYBACK_RATES.map((rate) => (
                  <SelectItem key={rate} value={String(rate)}>
                    {rate}x
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </>
    );
  } else {
    stageContent = (
      <NotReady version={version} isImageReview={isImageReview} canUploadVersion={canUploadVersion} onCheckAgain={onCheckAgain} />
    );
  }

  return (
    <div
      ref={refs.card}
      className={cn(
        "rounded-md border border-border bg-card p-2 sm:p-4 lg:flex lg:h-full lg:flex-col lg:justify-center",
        // Upright phones and tablets: flush, so the picture uses the column's full width.
        "max-lg:portrait:rounded-none max-lg:portrait:border-x-0 max-lg:portrait:p-0",
        PINNED_PLAYER_CLASS
      )}
    >
      <div
        ref={refs.stage}
        className="mx-auto w-full max-lg:landscape:max-w-[calc((100dvh_-_9rem)_*_16_/_9)]"
        style={mediaStageMaxWidthPx ? { maxWidth: `${Math.round(mediaStageMaxWidthPx)}px` } : undefined}
      >
        {stageContent}
      </div>
    </div>
  );
}
