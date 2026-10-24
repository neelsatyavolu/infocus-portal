"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Play } from "lucide-react";
import { cn } from "@/src/lib/utils";

const THUMB_SIZE: Record<"xs" | "sm" | "md" | "fill", string> = {
  xs: "w-16",
  sm: "w-[72px]",
  md: "w-24",
  fill: "w-full"
};

/** A small dark label on top of media (duration, version, "Processing"). Stays dark in Light mode. */
export function MediaBadge({ children, mono = true, className }: { children: ReactNode; mono?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-sm bg-black/75 px-1.5 text-[11px] font-medium leading-none text-[var(--soft-white)]",
        mono && "font-mono-broadcast tabular-nums",
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * A 16:9 thumbnail on a dark frame (media stays dark in both themes), with a Play-icon fallback
 * when there's no image or it fails to load, and four corner slots for MediaBadges or a checkbox.
 */
export function MediaThumb({
  src,
  alt = "",
  size = "fill",
  fit = "cover",
  sizes,
  priority = false,
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  fallback,
  className
}: {
  src?: string | null;
  alt?: string;
  /** xs 64px, sm 72px, md 96px wide, or fill the parent. */
  size?: "xs" | "sm" | "md" | "fill";
  fit?: "cover" | "contain";
  /** next/image sizes for `fill` thumbs in grids. */
  sizes?: string;
  priority?: boolean;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  /** Replaces the Play icon (e.g. a progress ring while processing). */
  fallback?: ReactNode;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const small = size !== "fill";
  return (
    <div className={cn("relative aspect-video shrink-0 overflow-hidden rounded-sm bg-black", THUMB_SIZE[size], className)}>
      {showImage && src ? (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          priority={priority}
          draggable={false}
          sizes={sizes ?? (small ? "96px" : "(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw")}
          onError={() => setFailedSrc(src)}
          className={fit === "contain" ? "object-contain" : "object-cover"}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-[var(--soft-white)]/50">
          {fallback ?? <Play className={small ? "h-4 w-4" : "h-6 w-6"} aria-hidden />}
        </div>
      )}
      {topLeft ? <div className="absolute left-1.5 top-1.5 z-10 flex">{topLeft}</div> : null}
      {topRight ? <div className="absolute right-1.5 top-1.5 z-10 flex">{topRight}</div> : null}
      {bottomLeft ? <div className="absolute bottom-1.5 left-1.5 z-10 flex">{bottomLeft}</div> : null}
      {bottomRight ? <div className="absolute bottom-1.5 right-1.5 z-10 flex">{bottomRight}</div> : null}
    </div>
  );
}

/**
 * A media card: 16:9 thumb on top, then a one-line title with a status slot and a muted meta
 * line. Renders as a link, a button or a plain card; equal height in grids. `highlight="new"`
 * adds the green edge for something new since the last visit.
 */
export function MediaTile({
  thumbnailUrl,
  title,
  meta,
  status,
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  highlight,
  href,
  onClick,
  pressed,
  sizes,
  className
}: {
  thumbnailUrl: string | null | undefined;
  title: string;
  meta?: ReactNode;
  /** A StatusTag, right of the title. */
  status?: ReactNode;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  highlight?: "new" | "active";
  href?: string;
  onClick?: () => void;
  /** A toggle tile (e.g. selecting clips): sets aria-pressed on the button. */
  pressed?: boolean;
  sizes?: string;
  className?: string;
}) {
  const classes = cn(
    "group flex h-full min-w-0 flex-col overflow-hidden rounded-md border bg-card text-left text-card-foreground transition-colors",
    highlight ? "border-[var(--brand-green)]/60" : "border-border",
    highlight === "active" && "bg-[rgb(43_179_110/0.08)]",
    (href || onClick) && "hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className
  );
  const body = (
    <>
      <MediaThumb
        src={thumbnailUrl}
        alt=""
        sizes={sizes}
        topLeft={topLeft}
        topRight={topRight}
        bottomLeft={bottomLeft}
        bottomRight={bottomRight}
        className="rounded-none"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>
            {title}
          </span>
          {status}
        </span>
        {meta ? <span className="min-w-0 truncate text-xs text-muted-foreground">{meta}</span> : null}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href as never} className={classes}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={pressed} className={classes}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}
