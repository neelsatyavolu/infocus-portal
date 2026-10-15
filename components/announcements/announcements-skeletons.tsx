import { FEED_RAIL_GRID, HUB_RAIL_GRID } from "@/components/announcements/sizes";
import { LoadingRegion, PageHeaderSkeleton, PanelSkeleton, Skeleton, SkeletonText } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";

function FeedDaySkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      <div className="flex h-6 items-center gap-2">
        <Skeleton className="h-3 w-40" />
        <span className="h-px flex-1 bg-border" />
        <Skeleton className="h-3 w-12" />
      </div>
      <div className="divide-y divide-border rounded-md border border-border bg-card">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 p-4 sm:grid-cols-[2.25rem_minmax(0,1fr)] md:p-5">
            <Skeleton className="h-8 w-8 rounded-full sm:h-9 sm:w-9" />
            <div className="min-w-0 space-y-3 pt-2">
              <div className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-14" />
              </div>
              <SkeletonText lines={index % 2 ? 2 : 3} className="max-w-[72ch]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** /announcements while the server loads Slack. */
export function FeedPageSkeleton() {
  return (
    <LoadingRegion label="Loading announcements" className="space-y-5">
      <PageHeaderSkeleton actions={0} />
      <div className={FEED_RAIL_GRID}>
        <div className="space-y-6">
          <FeedDaySkeleton rows={3} />
          <FeedDaySkeleton rows={2} />
        </div>
        <PanelSkeleton rows={6} className="max-lg:hidden" />
      </div>
    </LoadingRegion>
  );
}

/** The Submitted bucket chips while nothing has loaded yet. */
export function SubmittedChipsSkeleton() {
  return (
    <div aria-hidden className="flex gap-2">
      {["w-12", "w-24", "w-28", "w-24"].map((width, index) => (
        <Skeleton key={index} className={cn("h-10 rounded-md md:h-9", width)} />
      ))}
    </div>
  );
}

/** The whole Submitted toolbar: chips at the start; College Visits, Refresh and ⋯ at the end. */
function SubmittedToolbarSkeleton() {
  return (
    <div aria-hidden className="flex min-w-0 items-start gap-2 md:gap-3">
      <div className="min-w-0 flex-1 overflow-hidden">
        <SubmittedChipsSkeleton />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-9 w-36 rounded-md max-md:hidden" />
        <Skeleton className="h-10 w-10 rounded-md md:h-9 md:w-9" />
        <Skeleton className="h-10 w-10 rounded-md md:hidden" />
      </div>
    </div>
  );
}

/** Submitted sections: a header row over the same card grid the list uses. */
export function SubmittedSectionsSkeleton() {
  return (
    <div aria-hidden className="space-y-6">
      {[4, 2].map((cards, section) => (
        <div key={section} className="space-y-3">
          <div className="flex min-h-10 items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3.5 w-5" />
            </div>
            <Skeleton className="h-10 w-24 rounded-md md:h-8" />
          </div>
          <div className="@container">
            <div className="grid gap-3 @3xl:grid-cols-2">
              {Array.from({ length: cards }, (_, index) => (
                <div key={index} className="flex min-h-48 flex-col rounded-md border border-border bg-card">
                  <div className="flex-1 space-y-3 p-4 md:p-5">
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-36" />
                    </div>
                    <SkeletonText lines={3} />
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 md:px-5">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-10 w-16 rounded-md md:h-8" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** /announcements/submitted while the server checks who can invite. */
export function SubmittedPageSkeleton() {
  return (
    <LoadingRegion label="Loading submitted announcements" className="space-y-5">
      <PageHeaderSkeleton actions={1} />
      <SubmittedToolbarSkeleton />
      <SubmittedSectionsSkeleton />
    </LoadingRegion>
  );
}

/** The PA editor (Regenerate and Refresh in its header) and its rail, before any script has loaded. */
export function PaEditorSkeleton() {
  return (
    <div aria-hidden className={HUB_RAIL_GRID}>
      <div className="rounded-md border border-border bg-card">
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 md:px-5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-28 rounded-md md:h-8" />
            <Skeleton className="h-10 w-10 rounded-md md:h-8 md:w-8" />
          </div>
        </div>
        <div className="space-y-4 p-4 md:p-5">
          <Skeleton className="h-3.5 w-[28rem] max-w-full" />
          <SkeletonText lines={12} />
        </div>
      </div>
      <div className="space-y-5 max-xl:hidden">
        <PanelSkeleton rows={2} />
        <PanelSkeleton rows={3} />
      </div>
    </div>
  );
}

/** /announcements/pa while its route loads. */
export function PaPageSkeleton() {
  return (
    <LoadingRegion label="Loading the PA script" className="space-y-5">
      <PageHeaderSkeleton actions={0} />
      <PaEditorSkeleton />
    </LoadingRegion>
  );
}
