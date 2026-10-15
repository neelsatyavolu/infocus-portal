import { CardGridSkeleton, LoadingRegion, PageHeaderSkeleton, Skeleton } from "@/components/kit/skeleton";

/**
 * Shaped like a redesigned page: a 2px progress line at the top of the column (every navigation
 * that waits on the server shows it, whatever link started it), the header plate, a row of equal
 * cards and one wide block.
 */
export default function AppLoading() {
  return (
    <LoadingRegion label="Loading" className="space-y-5">
      <span aria-hidden className="block h-0.5 w-full overflow-hidden rounded-full bg-[var(--ink-3)]">
        <span className="block h-full w-1/3 rounded-full bg-[var(--brand-green)] motion-safe:animate-[loading-bar_1s_ease-in-out_infinite]" />
      </span>
      <PageHeaderSkeleton actions={1} />
      <CardGridSkeleton count={3} className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" itemClassName="h-40" />
      <Skeleton className="h-56 w-full rounded-md" />
    </LoadingRegion>
  );
}
