import { LoadingRegion, Skeleton, SkeletonText } from "@/components/kit/skeleton";

function SectionSkeleton() {
  return (
    <div className="border-t border-border first:border-t-0">
      <div className="flex h-12 items-center gap-3 px-4">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-3.5 w-6" />
        <Skeleton className="h-4 w-28" />
        <span className="flex-1" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
      <div className="max-w-[70ch] pb-4 pl-4 pr-4 sm:pl-10">
        <SkeletonText lines={3} />
      </div>
    </div>
  );
}

/** The Rundown column's placeholder (80rem of workspace width and up). */
function RundownSkeleton() {
  return (
    <div className="hidden border-l border-border @min-[80rem]/tp:block">
      <div className="flex h-14 items-center border-b border-border px-3">
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="py-1">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex h-10 items-center gap-2 px-3">
            <Skeleton className="h-3 w-5" />
            <Skeleton className={index % 2 ? "h-3 w-20" : "h-3 w-28"} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * First-load placeholder shaped like the workspace: the rail and the toolbar from 56rem of
 * workspace width (plus the Rundown column from 80rem), the script card below 56rem. Container
 * queries, since it renders before the page can measure itself.
 */
export function TeleprompterWorkspaceSkeleton() {
  return (
    <LoadingRegion label="Loading scripts" className="@container/tp">
      <div className="grid overflow-clip rounded-md border border-border bg-card @min-[56rem]/tp:grid-cols-[18rem_minmax(0,1fr)] @min-[80rem]/tp:grid-cols-[minmax(18rem,1fr)_minmax(0,50rem)_minmax(15rem,1fr)]">
        <div className="hidden border-r border-border @min-[56rem]/tp:block">
          <div className="flex h-14 items-center border-b border-border px-3">
            <Skeleton className="h-3 w-20" />
          </div>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex min-h-14 items-center gap-3 border-b border-border px-3 py-2.5">
              <div className="w-12 space-y-1.5">
                <Skeleton className="h-2.5 w-7" />
                <Skeleton className="h-3 w-10" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className={index % 2 ? "h-3.5 w-3/4" : "h-3.5 w-full"} />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <div className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-2.5 @min-[56rem]/tp:hidden">
            <div className="w-12 space-y-1.5">
              <Skeleton className="h-2.5 w-7" />
              <Skeleton className="h-3 w-10" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex h-12 items-center gap-2 border-b border-border px-4 @min-[56rem]/tp:h-14">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="hidden h-4 w-56 max-w-full @min-[56rem]/tp:block" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="hidden h-9 w-28 rounded-md @min-[56rem]/tp:block" />
            <Skeleton className="h-8 w-20 rounded-md @min-[56rem]/tp:h-9" />
          </div>
          {Array.from({ length: 4 }, (_, index) => (
            <SectionSkeleton key={index} />
          ))}
        </div>
        <RundownSkeleton />
      </div>
    </LoadingRegion>
  );
}
