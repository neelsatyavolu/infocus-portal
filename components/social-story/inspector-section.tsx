import { useId, type ReactNode } from "react";
import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { STORY_LABEL_CLASS } from "@/components/story-maker/story-fields";
import { cn } from "@/src/lib/utils";

/** Put sections inside this: hairlines between them, and no doubled padding at the card's edges. */
export const INSPECTOR_BODY_CLASS = "divide-y divide-border";
/** The fields card; the phone action bar's jump button scrolls here. */
export const FIELDS_ID = "story-fields";

/**
 * The fields card beside the preview. It is a size container, so fields pair up by the card's
 * width (`@min-[30rem]:`) rather than the window's.
 */
export function InspectorCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      id={FIELDS_ID}
      aria-label="Story text and photos"
      className={cn("@container min-w-0 scroll-mt-20 rounded-md border border-border bg-card p-4 md:p-5", className)}
    >
      {children}
    </section>
  );
}

/**
 * One block of the inspector: an 11px caps title, an optional mono count and status tag right
 * after it, optional actions (h-8 from md) on the right, then the fields. The header wraps, so
 * actions drop under the title in a narrow card instead of running past its edge (as kit
 * PanelSection does).
 */
export function InspectorSection({
  title,
  count,
  tag,
  actions,
  id,
  className,
  children
}: {
  title: ReactNode;
  /** Mono count after the title, like kit SectionLabel's `count` ("12", "3 / 60"). */
  count?: ReactNode;
  /** A StatusTag or CountBadge. */
  tag?: ReactNode;
  actions?: ReactNode;
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("grid min-w-0 scroll-mt-20 gap-4 py-5 first:pt-0 last:pb-0", className)}
    >
      <div className="flex min-h-8 min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={headingId} className={cn(STORY_LABEL_CLASS, "shrink-0")}>{title}</h3>
          {count != null ? <span className="font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">{count}</span> : null}
          {tag}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function FieldSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className={cn("w-full rounded-md", tall ? "h-20" : "h-10 md:h-9")} />
    </div>
  );
}

/** Page-shaped placeholder for the inspector: before drafts load, and while a show loads. */
export function InspectorSkeleton({ label = "Loading", note, bars = 0 }: { label?: string; note?: string; bars?: number }) {
  return (
    <LoadingRegion label={label} className="grid gap-5">
      {Array.from({ length: bars }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-md md:h-9" />
      ))}
      <FieldSkeleton />
      <FieldSkeleton tall />
      <FieldSkeleton />
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
    </LoadingRegion>
  );
}
