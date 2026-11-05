import { LoadingRegion, PageHeaderSkeleton, Skeleton } from "@/components/kit/skeleton";

/**
 * Shaped like the common case, a package not on YouTube yet: the header plate (Back button) and
 * the one-line status panel. A published package grows the video and embed panel below it,
 * instead of a large video block collapsing for every unpublished one.
 */
export default function PublicationLoading() {
  return (
    <LoadingRegion label="Loading the package" className="space-y-5">
      <PageHeaderSkeleton actions={1} />
      <div aria-hidden className="flex min-w-0 items-center gap-4 rounded-md border border-border bg-card p-4 md:p-5">
        <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
    </LoadingRegion>
  );
}
