"use client";

import type { MouseEvent, ReactNode } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { MediaBadge } from "@/components/kit/media";
import { formatDuration, formatEtaCompact, shouldBypassNextImageOptimization, uploadStatusLabel } from "@/components/project-assets/format";
import type { MediaTileVersion, ThumbStatus } from "@/components/project-assets/types";
import { cn } from "@/src/lib/utils";

/** Cards fill an auto-fill grid of ≥232px columns (two columns on phones). */
const CARD_IMAGE_SIZES = "(min-width: 640px) 360px, 50vw";

/** Upload ring (Preparing / Uploading with ETA / Failed) or the "Processing" label. Flat SVG strokes. */
function UploadRing({
  status,
  progress,
  etaSeconds,
  compact
}: {
  status: ThumbStatus;
  progress: number;
  etaSeconds: number | null;
  compact: boolean;
}) {
  if (status === "PROCESSING") {
    return (
      <span className={cn("font-semibold tracking-tight text-[var(--soft-white)]", compact ? "text-[11px]" : "text-base")}>
        Processing
      </span>
    );
  }

  const boundedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const ringColor = status === "FAILED" ? "hsl(var(--destructive))" : "hsl(var(--primary))";

  return (
    <span className="flex flex-col items-center gap-1.5">
      <span className={cn("relative grid place-items-center", compact ? "h-9 w-9" : "h-20 w-20")}>
        <svg aria-hidden viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="16.5" fill="#000" strokeWidth="3" style={{ stroke: "rgb(255 255 255 / 0.16)" }} />
          <circle
            cx="18"
            cy="18"
            r="16.5"
            fill="none"
            strokeWidth="3"
            pathLength={100}
            strokeDasharray={`${Math.max(2, boundedProgress)} 100`}
            style={{ stroke: ringColor }}
          />
        </svg>
        <span className="relative grid text-center">
          {compact ? null : (
            <span className="text-[11px] font-medium uppercase tracking-[0.11em] text-[var(--soft-white)]/70">
              {uploadStatusLabel(status)}
            </span>
          )}
          <span
            className={cn(
              "font-mono-broadcast font-semibold tabular-nums text-[var(--soft-white)]",
              compact ? "text-[11px]" : "text-sm"
            )}
          >
            {boundedProgress}%
          </span>
        </span>
      </span>
      {compact ? null : (
        <span className="text-[11px] text-[var(--soft-white)]/70">
          {status === "UPLOADING" ? formatEtaCompact(etaSeconds) : "Working..."}
        </span>
      )}
    </span>
  );
}

/**
 * The 16:9 thumbnail of an asset: picture, upload ring or "No preview", on a dark frame that
 * stays dark in Light mode. The picture is a real link (cmd/ctrl/middle-click opens a new tab);
 * a plain click calls `onOpen` so the review opens inside a transition. Overlays: `topLeft`
 * (selection box), version bottom-left, duration bottom-right. Nothing sits top-right.
 */
export function AssetThumb({
  href,
  title,
  version,
  status,
  progress,
  etaSeconds,
  size = "card",
  topLeft,
  showVersion = true,
  onOpen
}: {
  href: string;
  title: string;
  version: Pick<MediaTileVersion, "thumbnailUrl" | "versionNumber" | "durationSeconds">;
  status: ThumbStatus | null;
  progress: number;
  etaSeconds: number | null;
  size?: "card" | "row";
  topLeft?: ReactNode;
  showVersion?: boolean;
  onOpen: (href: string) => void;
}) {
  const card = size === "card";

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onOpen(href);
  }

  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-black", card ? "w-full" : "w-20 rounded-sm @max-[36rem]:w-24")}>
      <a
        href={href}
        tabIndex={-1}
        draggable={false}
        aria-hidden
        onClick={onClick}
        className="relative grid aspect-video w-full place-items-center"
      >
        {status ? (
          <UploadRing status={status} progress={progress} etaSeconds={etaSeconds} compact={!card} />
        ) : version.thumbnailUrl ? (
          <Image
            src={version.thumbnailUrl}
            alt={`${title} thumbnail`}
            width={640}
            height={360}
            draggable={false}
            className="aspect-video h-full w-full object-cover"
            sizes={card ? CARD_IMAGE_SIZES : "96px"}
            unoptimized={shouldBypassNextImageOptimization(version.thumbnailUrl)}
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-[var(--soft-white)]/60">
            <ImageOff className={card ? "h-5 w-5" : "h-4 w-4"} aria-hidden />
            {card ? <span className="text-xs">No preview</span> : null}
          </span>
        )}
      </a>
      {topLeft ? <div className="absolute left-1.5 top-1.5 z-10 flex">{topLeft}</div> : null}
      {card && showVersion ? (
        <div className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 flex">
          <MediaBadge className="bg-[var(--brand-fill)] text-[var(--on-brand)]">v{version.versionNumber}</MediaBadge>
        </div>
      ) : null}
      {/* The row's thumbnail is too small for the duration beside the ring; the card has room. */}
      {version.durationSeconds !== null && (card || !status) ? (
        <div className={cn("pointer-events-none absolute z-10 flex", card ? "bottom-1.5 right-1.5" : "bottom-0.5 right-0.5")}>
          <MediaBadge className={card ? undefined : "h-4 px-1 text-[11px]"}>{formatDuration(version.durationSeconds)}</MediaBadge>
        </div>
      ) : null}
    </div>
  );
}
