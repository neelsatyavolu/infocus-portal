import { ListSkeleton, LoadingRegion, PageHeaderSkeleton, Skeleton, ToolbarSkeleton } from "@/components/kit/skeleton";

/** Shaped like the page: header plate, the one-card status strip, the filter row, then rows. */
export function LivestreamsSkeleton() {
  return (
    <LoadingRegion label="Loading livestreams…" className="space-y-5">
      <PageHeaderSkeleton actions={2} />
      <Skeleton className="h-[104px] rounded-md" />
      <ToolbarSkeleton start={1} end={0} />
      <ListSkeleton rows={6} />
    </LoadingRegion>
  );
}
