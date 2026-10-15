import { CardGridSkeleton, LoadingRegion, Skeleton } from "@/components/kit/skeleton";

/**
 * Shaped like /ideas: the header plate with the set controls, the note, a section, a grid of cards.
 * Progress shows in the top bar, so there is no loading bar here (same as the app's loading view).
 */
export default function IdeasLoading() {
  return (
    <LoadingRegion className="space-y-5">
      <div aria-hidden className="brand-hero-panel flex flex-wrap items-end gap-x-6 gap-y-4 px-4 py-5 md:px-6">
        <div className="min-w-0 flex-[1_1_320px] space-y-2.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-80 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex h-10 gap-px max-sm:w-full md:h-9">
          <Skeleton className="aspect-square h-full rounded-l-md rounded-r-none" />
          <Skeleton className="h-full w-36 rounded-none max-sm:flex-1" />
          <Skeleton className="aspect-square h-full rounded-l-none rounded-r-md" />
        </div>
      </div>
      <div aria-hidden className="max-w-3xl space-y-1.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <div aria-hidden className="space-y-1.5 border-b border-border pb-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="@container">
        <CardGridSkeleton count={6} className="grid gap-4 @2xl:grid-cols-2 @6xl:grid-cols-3" itemClassName="h-64" />
      </div>
    </LoadingRegion>
  );
}
