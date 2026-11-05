"use client";

import { usePathname } from "next/navigation";
import { PageHeaderSkeleton, Skeleton } from "@/components/kit/skeleton";
import { StageWorkspaceSkeleton } from "@/components/package-stages/stage-states";

/**
 * Shaped like a group's stage page, so a stage switch or J/K shows the page's own outline: the
 * compact plate with the stepper, the five stage cells, Initial Cut's compact approval row on
 * its routes, then the decision bar and the work beside the feedback column (the stage skeleton
 * every stage shares, which also announces the loading state).
 */
export default function GroupStageLoading() {
  const pathname = usePathname();
  const initial = /\/initial-stage-[123]$/.test(pathname ?? "");
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeaderSkeleton actions={1} className="py-4" />
      <div aria-hidden className="space-y-3">
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="flex h-14 min-w-0 flex-col justify-center gap-1.5 border-t-4 border-t-[var(--ink-4)] px-1.5 sm:h-16 sm:px-3"
            >
              <Skeleton className="h-2.5 w-full max-w-20" />
              <Skeleton className="h-3.5 w-2/3 max-w-24" />
            </div>
          ))}
        </div>
        {initial ? (
          <div className="flex h-10 w-fit max-w-full items-center gap-0.5 rounded-md border border-input p-0.5 max-sm:w-full md:h-9">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex h-full min-w-0 items-center px-3 max-sm:flex-1 max-sm:justify-center">
                <Skeleton className="h-3 w-16 md:w-40" />
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <StageWorkspaceSkeleton embedded />
    </div>
  );
}
