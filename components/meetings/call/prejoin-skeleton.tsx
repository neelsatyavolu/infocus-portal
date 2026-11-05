import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";
import { Avatar } from "./avatar";
import { PREJOIN_AREA, PREJOIN_CONTAINER, PREJOIN_GRID } from "./prejoin-layout";
import { MeetBar, MeetingsMark } from "./top-bar";

/**
 * While the call code downloads and the meeting loads (before anyone pressed Join): the
 * pre-join page's own shape in Ink 3 blocks, so nothing jumps when it arrives.
 */
export function PreJoinSkeleton({ userName }: { userName?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--ink)]">
      <MeetBar
        left={<MeetingsMark />}
        right={userName ? <Avatar name={userName} size="sm" /> : <Skeleton className="h-8 w-8 rounded-full" />}
      />
      <main className="flex flex-1 flex-col py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:justify-center md:py-10">
        <LoadingRegion label="Loading the meeting" className={PREJOIN_CONTAINER}>
          <div className={PREJOIN_GRID}>
            <div aria-hidden className={cn("brand-hero-panel space-y-2.5 p-4 md:p-5", PREJOIN_AREA.head)}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-56 max-w-full" />
              <Skeleton className="h-4 w-44 max-w-full" />
            </div>
            <div aria-hidden className={cn("space-y-3", PREJOIN_AREA.preview)}>
              <Skeleton aspect="16/9" className="rounded-md" />
              <Skeleton className="h-3.5 w-60 max-w-full" />
            </div>
            <div aria-hidden className={cn("space-y-3", PREJOIN_AREA.actions)}>
              <Skeleton className="h-11 rounded-md" />
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-11 rounded-md" />
            </div>
          </div>
        </LoadingRegion>
      </main>
    </div>
  );
}
