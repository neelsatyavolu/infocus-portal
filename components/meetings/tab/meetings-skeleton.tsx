import { Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";
import { HEADER_HIDDEN_WHEN_STACKED } from "./board-columns";
import { MEETING_ROW_GRID } from "./meeting-row-parts";

/**
 * A list panel while the meetings load, shaped like the real one: the header (title and count,
 * plus the "Next 3 weeks" line for Upcoming; hidden when stacked, like the real header) over
 * rows on the real row grid (day and time | title and meta | actions). The Meetings tab places it
 * where the panel will be, so nothing moves when the list arrives.
 */
export function ListPanelSkeleton({ rows, description = false, actions = false }: { rows: number; description?: boolean; actions?: boolean }) {
  return (
    <div aria-hidden className={cn("overflow-hidden rounded-md border border-border bg-card", HEADER_HIDDEN_WHEN_STACKED)}>
      <div className="space-y-1.5 border-b border-border px-4 py-3 md:px-5">
        <div className="flex min-h-8 items-center">
          <Skeleton className="h-4 w-24" />
        </div>
        {description ? <Skeleton className="h-3 w-20" /> : null}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className={MEETING_ROW_GRID}>
            <div className="col-span-2 flex items-center gap-2 md:col-span-1 md:flex-col md:items-start md:gap-1.5 md:self-start md:pt-[3px]">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3.5 w-14" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Skeleton className={cn("h-3.5", index % 3 === 1 ? "w-1/2" : "w-2/3")} />
              <Skeleton className="h-3 w-1/3" />
            </div>
            {actions ? <Skeleton className="h-10 w-12 rounded-md md:h-8 md:w-[7.5rem]" /> : <Skeleton className="h-3 w-4" />}
          </div>
        ))}
      </div>
    </div>
  );
}
