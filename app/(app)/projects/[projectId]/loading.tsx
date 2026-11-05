import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";

const TILE_GRID = "grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(232px,1fr))]";
/** Toolbar controls: 40px on phones, 36px from md (the real toolbar's touch size). */
const TOOL = "h-10 rounded-md md:h-9";

/**
 * Shaped like the project assets page: header plate (actions stay on the title row on phones),
 * one toolbar row, folder tiles and asset cards with the real cards' row heights.
 */
export default function ProjectLoading() {
  return (
    <LoadingRegion label="Loading project" className="space-y-5">
      <div
        aria-hidden
        className="brand-hero-panel flex flex-wrap items-end gap-x-6 gap-y-4 px-4 py-5 max-sm:flex-nowrap max-sm:items-start max-sm:gap-x-3 md:px-6"
      >
        <div className="min-w-0 flex-[1_1_320px] space-y-2.5 max-sm:basis-0">
          <Skeleton className="h-3 w-[120px] max-w-full" />
          <Skeleton className="h-7 w-[280px] max-w-full" />
          <Skeleton className="h-4 w-[220px] max-w-full" />
        </div>
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-10 w-10 rounded-md md:h-9 md:w-9" />
          <Skeleton className="h-10 w-24 rounded-md md:h-9" />
        </div>
      </div>

      <div aria-hidden className="flex items-center gap-3">
        <Skeleton className={`${TOOL} w-10 md:w-9`} />
        <Skeleton className={`${TOOL} w-24 lg:w-72`} />
        <span className="flex-1" />
        <Skeleton className={`${TOOL} w-10 sm:w-28`} />
        <Skeleton className={`${TOOL} w-20`} />
      </div>

      <div aria-hidden className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <div className={TILE_GRID}>
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} className="flex h-16 items-center gap-3 rounded-md border border-border bg-card px-3 sm:h-[72px]">
              <Skeleton className="h-9 w-9 shrink-0 rounded-md max-sm:hidden" />
              <span className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </span>
            </span>
          ))}
        </div>
      </div>

      <div aria-hidden className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <div className={TILE_GRID}>
          {Array.from({ length: 10 }, (_, index) => (
            <span key={index} className="flex flex-col overflow-hidden rounded-md border border-border bg-card">
              <Skeleton aspect="16/9" className="rounded-none" />
              <span className="flex flex-col gap-1.5 p-3">
                <span className="flex h-8 items-center max-sm:h-[3.25rem] max-sm:items-start max-sm:pt-1.5">
                  <Skeleton className="h-4 w-3/4" />
                </span>
                <Skeleton className="h-5 w-20" />
                <span className="flex h-[18px] items-center">
                  <Skeleton className="h-3 w-1/2" />
                </span>
              </span>
            </span>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
