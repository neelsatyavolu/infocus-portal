import { LoadingRegion, PageHeaderSkeleton } from "@/components/kit/skeleton";

const BLOCK = "block rounded-md border border-border bg-card motion-safe:animate-pulse";

/**
 * Home's loading view, shaped like the student grid (the largest group): the header plate, then
 * My package (2/3) beside Grade, and Activity (2/3) beside This week. The same blocks read as the
 * producer strip, grid and rail. The shell's top bar already draws the pending-route bar, so
 * there is no second progress bar here.
 */
export default function DashboardLoading() {
  return (
    <LoadingRegion className="space-y-4 sm:space-y-5">
      <PageHeaderSkeleton actions={1} />
      <div aria-hidden className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
        <span className={`${BLOCK} h-64 md:col-span-2`} />
        <span className={`${BLOCK} h-64`} />
        <span className={`${BLOCK} h-64 xl:col-start-3 xl:row-start-2 xl:h-48`} />
        <span className={`${BLOCK} h-48 md:col-span-2 xl:col-start-1 xl:row-start-2`} />
      </div>
    </LoadingRegion>
  );
}
