import { LoadingRegion, PageHeaderSkeleton, PanelSkeleton, Skeleton } from "@/components/kit/skeleton";

/** The view's cards while this date's editing state loads. */
export function EditingViewSkeleton() {
  return (
    <LoadingRegion label="Loading automatic editing" className="space-y-5">
      <PanelSkeleton rows={2} />
      <PanelSkeleton rows={5} />
    </LoadingRegion>
  );
}

/** The whole Editing page before the client reads the URL: header, show strip, view switcher, cards. */
export function EditingSkeleton() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton actions={0} />
      <div aria-hidden className="grid auto-cols-[minmax(6.5rem,1fr)] grid-flow-col gap-2 overflow-hidden">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-16 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-9 w-72 rounded-md" />
      <EditingViewSkeleton />
    </div>
  );
}
