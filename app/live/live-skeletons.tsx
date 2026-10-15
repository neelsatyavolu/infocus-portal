import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";
import type { DashTab } from "./live-status";

/** A card-shaped block (Ink 2 card, pulsing). */
function Block({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-md border border-border bg-card motion-safe:animate-pulse", className)} />;
}

/** A card with a 16:9 stage inside, for the broadcast previews. */
function StageBlock({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("block rounded-md border border-border bg-card p-4", className)}>
      <Skeleton className="mb-4 h-3 w-24" />
      <Skeleton aspect="16/9" />
    </span>
  );
}

/** Loading placeholders shaped like each tab, so nothing jumps when the livestream arrives. */
export function LiveTabSkeleton({ tab }: { tab: DashTab }) {
  return (
    <LoadingRegion label="Loading livestream">
      {tab === "scoreboard" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_25rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <Block className="h-52" />
            <div className="grid gap-4 md:grid-cols-2">
              <Block className="h-64" />
              <Block className="h-64" />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <StageBlock />
            <Block className="h-36" />
          </div>
        </div>
      ) : null}
      {tab === "image" ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} aria-hidden className="block rounded-md border border-border bg-card p-2">
                <Skeleton aspect="16/9" />
                <Skeleton className="mt-2 h-3 w-3/4" />
              </span>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <StageBlock />
            <StageBlock />
          </div>
        </div>
      ) : null}
      {tab === "thumbnail" ? (
        <div className="grid gap-4 lg:grid-cols-[26rem_minmax(0,1fr)]">
          <Block className="h-96" />
          <StageBlock />
        </div>
      ) : null}
    </LoadingRegion>
  );
}
