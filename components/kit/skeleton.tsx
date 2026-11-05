import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/**
 * Loading placeholders shaped like the real page (DESIGN.md §10: Ink 3 blocks, pulsing opacity,
 * still under reduced motion). Use them in route loading.tsx files and in-page loads so nothing
 * jumps when data arrives. Wrap a whole loading view in <LoadingRegion>.
 */
export function Skeleton({ className, aspect }: { className?: string; aspect?: "16/9" | "9/16" | "4/5" | "1/1" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block rounded-sm bg-[var(--ink-3)] motion-safe:animate-pulse",
        aspect === "16/9" && "aspect-video w-full",
        aspect === "9/16" && "aspect-[9/16] w-full",
        aspect === "4/5" && "aspect-[4/5] w-full",
        aspect === "1/1" && "aspect-square w-full",
        className
      )}
    />
  );
}

/** Marks a loading view for assistive tech ("Loading…") without reading every block. */
export function LoadingRegion({ label = "Loading", className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cn("min-w-0", className)}>
      {children}
    </div>
  );
}

const LINE_WIDTHS = ["w-full", "w-11/12", "w-4/5", "w-2/3", "w-3/4"];

/** Lines of text. */
export function SkeletonText({ lines = 3, widths, className }: { lines?: number; widths?: string[]; className?: string }) {
  return (
    <span aria-hidden className={cn("block space-y-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn("h-3.5", widths?.[index] ?? (index === lines - 1 && lines > 1 ? "w-2/3" : LINE_WIDTHS[index % LINE_WIDTHS.length]))} />
      ))}
    </span>
  );
}

/** The PageHeader plate: eyebrow, title, one line, and action blocks on the right. */
export function PageHeaderSkeleton({ actions = 1, className }: { actions?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("brand-hero-panel flex flex-wrap items-end gap-x-6 gap-y-4 px-4 py-5 md:px-6", className)}>
      <div className="min-w-0 flex-[1_1_320px] space-y-2.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {actions > 0 ? (
        <div className="flex gap-2 max-sm:w-full">
          {Array.from({ length: actions }, (_, index) => (
            <Skeleton key={index} className="h-9 w-28 rounded-md max-sm:flex-1" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A Toolbar row: chip/field blocks at the start and one at the end. */
export function ToolbarSkeleton({ start = 3, end = 1 }: { start?: number; end?: number }) {
  return (
    <div aria-hidden className="flex flex-wrap items-center gap-2">
      {Array.from({ length: start }, (_, index) => (
        <Skeleton key={`s${index}`} className={cn("h-9 rounded-md", index === 0 ? "w-56" : "w-24")} />
      ))}
      <span className="flex-1" />
      {Array.from({ length: end }, (_, index) => (
        <Skeleton key={`e${index}`} className="h-9 w-24 rounded-md" />
      ))}
    </div>
  );
}

/** A Panel with a header line and `rows` rows. */
export function PanelSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-md border border-border bg-card p-4 md:p-5", className)}>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className={cn("h-4", index % 2 ? "w-4/5" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

/**
 * A grid of card blocks. The default grid is CardGrid's (auto-fill, 18rem minimum, 16px gaps);
 * pass the real grid's classes if the page uses another one.
 */
export function CardGridSkeleton({
  count = 3,
  className = "grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]",
  itemClassName = "h-40"
}: {
  count?: number;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div aria-hidden className={className}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={cn("block rounded-md border border-border bg-card motion-safe:animate-pulse", itemClassName)} />
      ))}
    </div>
  );
}

/** List rows inside a bordered card (inbox, queues, people). */
export function ListSkeleton({ rows = 6, leading = true, lines = 2, className }: { rows?: number; leading?: boolean; lines?: 1 | 2; className?: string }) {
  return (
    <div aria-hidden className={cn("divide-y divide-border overflow-hidden rounded-md border border-border bg-card", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
          {leading ? <Skeleton className="h-8 w-8 shrink-0 rounded-md" /> : null}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={cn("h-3.5", index % 3 === 1 ? "w-1/2" : "w-2/3")} />
            {lines === 2 ? <Skeleton className="h-3 w-1/3" /> : null}
          </div>
          <Skeleton className="h-5 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Table rows on the real column grid. `columns` = a width class per column. */
export function TableSkeleton({
  rows = 6,
  columns = ["w-2/3", "w-1/2", "w-1/3", "w-1/4"],
  className
}: {
  rows?: number;
  columns?: string[];
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("overflow-hidden rounded-md border border-border bg-card", className)}>
      <div className="flex h-10 items-center gap-4 border-b border-border px-3">
        {columns.map((_, index) => (
          <span key={index} className="flex-1">
            <Skeleton className="h-2.5 w-16" />
          </span>
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-12 items-center gap-4 border-b border-border px-3 last:border-b-0">
          {columns.map((width, index) => (
            <span key={index} className="flex-1">
              <Skeleton className={cn("h-3.5", width)} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The SegmentNav / stage bar: `count` cells with the top rule. */
export function SegmentNavSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-2 sm:flex">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="min-h-[3.75rem] flex-1 space-y-2 border-t-4 border-t-[var(--ink-4)] px-3 pt-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** List on the left, detail on the right (queues). */
export function ListDetailSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-hidden className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <ListSkeleton rows={rows} />
      <PanelSkeleton rows={6} className="max-lg:hidden" />
    </div>
  );
}
