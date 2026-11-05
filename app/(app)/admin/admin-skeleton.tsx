import { LoadingRegion, PageHeaderSkeleton, PanelSkeleton, Skeleton } from "@/components/kit/skeleton";

/** First load with nothing cached: tabs, the header plate, and an Overview-shaped page. */
export function AdminSkeleton() {
  return (
    <LoadingRegion label="Loading Admin" className="space-y-5">
      <div aria-hidden="true" className="-mt-1 flex h-10 items-center gap-6 border-b border-border">
        {["w-20", "w-14", "w-20", "w-16"].map((width, index) => (
          <Skeleton key={index} className={`h-3.5 ${width}`} />
        ))}
      </div>
      <PageHeaderSkeleton actions={1} />
      <div className="space-y-6">
        <div aria-hidden="true" className="grid gap-px overflow-hidden rounded-md border border-border bg-border @2xl:grid-cols-2 @5xl:grid-cols-4">
          {[0, 1, 2, 3].map((cell) => (
            <div key={cell} className="space-y-2.5 bg-card px-4 py-3.5 md:px-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-3.5 w-36 max-w-full" />
            </div>
          ))}
        </div>
        <PanelSkeleton rows={3} />
        <div aria-hidden="true" className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border @2xl:grid-cols-3 @5xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((cell) => (
            <div key={cell} className="space-y-2 bg-card px-4 py-4 md:px-5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-14" />
              <Skeleton className="h-3 w-24 max-w-full" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
