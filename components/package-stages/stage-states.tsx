import { LoadingRegion, PageHeaderSkeleton, PanelSkeleton, Skeleton } from "@/components/kit/skeleton";
import type { CycleStageSlug } from "@/src/lib/package-cycle-gates";
import { cn } from "@/src/lib/utils";

/**
 * Page-shaped loading view for a stage: the header plate (or the producer decision bar), then
 * the media panel beside the rail, in the same grid and phone order as the real page (students:
 * Where it stands, media, then feedback, which waits below the media until it has notes).
 * A-roll draws a clip grid; Initial and Final Cut draw one 16:9 player. Producers' Final Cut adds
 * a second rail panel. Also the route loading.tsx for the stage pages.
 */
export function StageWorkspaceSkeleton({
  slug,
  embedded = false,
  className
}: {
  slug?: CycleStageSlug;
  embedded?: boolean;
  className?: string;
}) {
  const clips = slug === "a-roll" || !slug;
  return (
    <LoadingRegion label="Loading stage" className={cn("space-y-5", !embedded && "lg:pb-18", className)}>
      {embedded ? (
        <div
          aria-hidden
          className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
        >
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-64 max-w-full" />
          <span className="flex-1" />
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      ) : (
        <PageHeaderSkeleton actions={2} />
      )}
      <div
        aria-hidden
        className={cn(
          "grid items-start gap-5",
          embedded ? "xl:grid-cols-[minmax(0,1fr)_24rem]" : "xl:grid-cols-[minmax(0,1fr)_22rem]"
        )}
      >
        <div
          className={cn(
            "space-y-4 rounded-md border border-border bg-card p-4",
            !embedded && "max-xl:order-3"
          )}
        >
          <div className="flex min-h-8 items-center justify-between gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
          {clips ? (
            <div className="@container">
              <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @3xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} aspect="16/9" className="rounded-md" />
                ))}
              </div>
            </div>
          ) : (
            <Skeleton aspect="16/9" className="rounded-md" />
          )}
        </div>
        {embedded ? (
          <div className="space-y-5">
            <PanelSkeleton rows={3} />
            {slug === "final-cut" ? <PanelSkeleton rows={2} /> : null}
          </div>
        ) : (
          <div className="space-y-5 max-xl:contents">
            <PanelSkeleton rows={2} className="max-xl:order-1" />
            <PanelSkeleton rows={2} className="max-xl:order-5" />
          </div>
        )}
      </div>
    </LoadingRegion>
  );
}
