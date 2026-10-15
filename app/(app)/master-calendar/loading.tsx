import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";

const WEEKDAY_COUNT = 5;
const WEEK_COUNT = 5;

/**
 * Page-shaped loading for what most visitors (viewers) get: the header plate with the month
 * stepper, then the month at full width (grid from 58rem of board width, agenda below). There is
 * no toolbar row or Day panel here: viewers have neither, and for producers the page itself
 * reserves the docked panel's column until it fills in.
 */
export default function MasterCalendarLoading() {
  return (
    <LoadingRegion label="Loading the master calendar" className="space-y-5">
      {/* The PageHeader plate; the stepper block matches MonthStepper (40px below md, 36px from md). */}
      <div aria-hidden className="brand-hero-panel flex flex-wrap items-end gap-x-6 gap-y-4 px-4 py-5 md:px-6">
        <div className="min-w-0 flex-[1_1_320px] space-y-2.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
          {/* The week legend wraps to a second line on phones. */}
          <Skeleton className="h-4 w-1/2 sm:hidden" />
        </div>
        <div className="flex gap-2 max-sm:w-full">
          <Skeleton className="h-10 w-36 rounded-md max-sm:flex-1 md:h-9" />
        </div>
      </div>

      <div aria-hidden className="@container min-w-0">
        <div className="space-y-5 @min-[58rem]:grid @min-[58rem]:grid-cols-5 @min-[58rem]:gap-px @min-[58rem]:space-y-0 @min-[58rem]:overflow-hidden @min-[58rem]:rounded-md @min-[58rem]:border @min-[58rem]:border-border @min-[58rem]:bg-border">
          {Array.from({ length: WEEKDAY_COUNT }, (_, index) => (
            <div key={`head-${index}`} className="hidden h-8 items-center bg-card px-3 @min-[58rem]:flex">
              <Skeleton className="h-2.5 w-14" />
            </div>
          ))}
          {Array.from({ length: WEEK_COUNT }, (_, week) => (
            <div key={`week-${week}`} className="space-y-2 @min-[58rem]:contents">
              <div className="flex h-8 items-center @min-[58rem]:hidden">
                <Skeleton className="h-2.5 w-24" />
              </div>
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border @min-[58rem]:contents @min-[58rem]:divide-y-0">
                {Array.from({ length: WEEKDAY_COUNT }, (_, day) => (
                  <div
                    key={day}
                    className="grid min-h-14 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 bg-card p-3 @min-[58rem]:flex @min-[58rem]:min-h-24 @min-[58rem]:flex-col @min-[58rem]:items-stretch @min-[58rem]:gap-2"
                  >
                    <Skeleton className="h-11 w-12 @min-[58rem]:h-6 @min-[58rem]:w-6" />
                    <div className="space-y-2">
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3.5 w-1/2 @min-[58rem]:w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
