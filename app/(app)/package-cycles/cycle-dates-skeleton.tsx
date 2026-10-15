import { LoadingRegion, PageHeaderSkeleton, Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";
import { CARDS_ONLY, DATES_CONTAINER, TABLE_ONLY } from "./cycle-parts";

const STAGE_COUNT = 5;
const ROWS = 3;
/** Same columns as the table (cycle w-44, five equal stages). */
const TABLE_GRID = "grid grid-cols-[11rem_repeat(5,minmax(0,1fr))]";

/** One 20px text line holding a skeleton bar, so rows have the loaded rows' height. */
function Line({ width }: { width: string }) {
  return (
    <span className="flex h-5 items-center">
      <Skeleton className={`h-3.5 ${width}`} />
    </span>
  );
}

/** The stage-dates card while it loads: table rows from 45rem, cycle blocks below (as loaded). */
export function CycleScheduleSkeleton() {
  return (
    <div aria-hidden className={DATES_CONTAINER}>
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className={TABLE_ONLY}>
          <div className={`${TABLE_GRID} items-end pb-2.5 pt-3`}>
            <span className="flex h-3.5 items-center pl-4 pr-3">
              <Skeleton className="h-2.5 w-12" />
            </span>
            {Array.from({ length: STAGE_COUNT }, (_, index) => (
              <span key={index} className="flex h-3.5 items-center px-2.5">
                <Skeleton className="h-2.5 w-16" />
              </span>
            ))}
          </div>
          {Array.from({ length: ROWS }, (_, row) => (
            <div key={row} className={`${TABLE_GRID} border-t border-border py-3`}>
              <span className="space-y-1 pl-4 pr-3">
                <Line width="w-28" />
                <Line width="w-16" />
              </span>
              {Array.from({ length: STAGE_COUNT }, (_, index) => (
                <span key={index} className="space-y-1 px-2.5">
                  <Line width="w-20" />
                  <Line width="w-12" />
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className={cn("divide-y divide-border", CARDS_ONLY)}>
          {Array.from({ length: ROWS }, (_, card) => (
            <div key={card} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <span className="space-y-1">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-3.5 w-16" />
                </span>
                <Skeleton className="h-5 w-16" />
              </div>
              <div className="mt-3 divide-y divide-border border-t border-border">
                {Array.from({ length: STAGE_COUNT }, (_, index) => (
                  <div key={index} className="flex items-start justify-between gap-4 py-2">
                    <Line width="w-32" />
                    <span className="flex flex-col items-end gap-0.5">
                      <Line width="w-20" />
                      <Line width="w-14" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The whole page while the route loads: header plate, the Stage dates heading, the card. */
export function CycleDatesPageSkeleton() {
  return (
    <LoadingRegion label="Loading cycle dates" className="space-y-5">
      <PageHeaderSkeleton actions={1} />
      <div className="space-y-3">
        <div aria-hidden>
          <span className="flex min-h-8 items-center">
            <Skeleton className="h-5 w-32" />
          </span>
          <span className="mt-0.5 flex h-5 items-center">
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </span>
        </div>
        <CycleScheduleSkeleton />
      </div>
    </LoadingRegion>
  );
}
