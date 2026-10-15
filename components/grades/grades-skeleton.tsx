import { PanelSkeleton, Skeleton } from "@/components/kit/skeleton";
import { TAB_LIST_CLASS } from "@/components/kit/tab-styles";
import {
  BAND_GRID_CLASS,
  OVERVIEW_GRID_CLASS,
  OVERVIEW_OTHER_CLASS,
  OVERVIEW_PACKAGES_CLASS,
  OVERVIEW_PARTICIPATION_CLASS,
  OTHER_BODY_CLASS,
  OTHER_LIVESTREAM_CLASS,
  OTHER_PORTFOLIO_CLASS,
  PACKAGE_ROW_CLASS
} from "@/components/grades/grades-layout";
import { cn } from "@/src/lib/utils";

/**
 * Loading shapes for the Grades screen, server-safe so the route's loading.tsx can use them too.
 * They follow the real grids (grades-layout.ts), so nothing jumps when the grades arrive.
 */

export function GradesTabsSkeleton() {
  return (
    <div aria-hidden className={cn(TAB_LIST_CLASS, "-mt-1")}>
      {["w-16", "w-20"].map((width) => (
        <span key={width} className="flex h-10 items-center">
          <Skeleton className={cn("h-3.5", width)} />
        </span>
      ))}
    </div>
  );
}

export function GradesOverviewSkeleton() {
  return (
    <div aria-hidden className="space-y-5">
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className={BAND_GRID_CLASS}>
          <div className="space-y-2.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-12 w-14" />
            <Skeleton className="h-4 w-16" />
          </div>
          {[0, 1, 2].map((cell) => (
            <div key={cell} className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className={OVERVIEW_GRID_CLASS}>
        {/* Same h-full / xl:h-auto as the real Packages Panel, so the swap doesn't jump. */}
        <div className={cn("h-full rounded-md border border-border bg-card", OVERVIEW_PACKAGES_CLASS)}>
          <div className="flex min-h-14 items-center border-b border-border px-4 md:px-5">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="divide-y divide-border">
            {[0, 1, 2].map((row) => (
              <div key={row} className={PACKAGE_ROW_CLASS}>
                <div className="col-span-2 space-y-2 sm:col-span-1">
                  <Skeleton className={cn("h-4", row === 1 ? "w-1/2" : "w-3/4")} />
                  <Skeleton className="h-5 w-24" />
                </div>
                {[0, 1].map((stat) => (
                  <div key={stat} className="space-y-2">
                    <Skeleton className="h-3 w-16 sm:ml-auto" />
                    <Skeleton className="h-4 w-14 sm:ml-auto" />
                  </div>
                ))}
                <div className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-3">
                  {[0, 1, 2, 3].map((tag) => (
                    <Skeleton key={tag} className="h-[18px] w-20" />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex min-h-12 items-center border-t border-border px-4 md:px-5">
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
        {/* Livestream & portfolio: two parts, side by side from md like the real card. */}
        <div className={cn("h-full rounded-md border border-border bg-card p-4 md:p-5", OVERVIEW_OTHER_CLASS)}>
          <div className="flex min-h-8 items-center">
            <Skeleton className="h-4 w-44" />
          </div>
          <div className={cn("mt-4", OTHER_BODY_CLASS)}>
            {[OTHER_LIVESTREAM_CLASS, OTHER_PORTFOLIO_CLASS].map((part) => (
              <div key={part} className={cn("space-y-3", part)}>
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-14" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ))}
          </div>
        </div>
        <PanelSkeleton rows={5} className={cn("h-full", OVERVIEW_PARTICIPATION_CLASS)} />
      </div>
    </div>
  );
}
