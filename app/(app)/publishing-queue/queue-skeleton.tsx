import { Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";

/**
 * The queue while it loads, on the same grid as the real content (summary tiles, the
 * "Upcoming shows" heading, the rundown), so nothing jumps when the data arrives.
 * tiles=3 is the producers' strip (YouTube takes its own row on phones); 2 is website managers'.
 */
export function QueueSkeleton({ tiles = 3, rows = 6 }: { tiles?: 2 | 3; rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the publishing queue" className="space-y-5">
      <div aria-hidden className={cn("grid grid-cols-2 gap-3 lg:gap-4", tiles === 3 && "sm:grid-cols-3")}>
        {Array.from({ length: tiles }, (_, index) => (
          <div
            key={index}
            className={cn(
              "space-y-2 rounded-md border border-border bg-card p-4 max-sm:p-3",
              tiles === 3 && index === 2 && "max-sm:col-span-2"
            )}
          >
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20 max-w-full" />
            <Skeleton className={cn("h-3 w-32 max-w-full", index < tiles - 1 && "max-sm:hidden")} />
          </div>
        ))}
      </div>
      <div aria-hidden className="space-y-1.5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3.5 w-56 max-w-full" />
      </div>
      <div aria-hidden className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-1 gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-2 xl:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-14 rounded-md" />
            <Skeleton className={cn("h-14 rounded-md max-md:hidden", index % 2 === 1 && "opacity-50")} />
          </div>
        ))}
      </div>
    </div>
  );
}
