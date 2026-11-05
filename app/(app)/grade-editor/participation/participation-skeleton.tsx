import { Skeleton, TableSkeleton } from "@/components/kit/skeleton";

/** Week | Pending, the week stepper, "Show off days" and (lg) the sort select; two rows on phones. */
export function ParticipationToolbarSkeleton() {
  return (
    <div aria-hidden className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-10 flex-1 rounded-md md:h-9 lg:w-44 lg:flex-none" />
      <Skeleton className="h-10 w-10 rounded-md md:h-9 md:w-9 lg:hidden" />
      <Skeleton className="h-10 w-full rounded-md max-lg:order-last md:h-9 lg:w-80" />
      <span className="hidden flex-1 lg:block" />
      <Skeleton className="h-10 w-10 rounded-md md:h-9 md:w-9" />
      <Skeleton className="h-9 w-40 rounded-md max-lg:hidden" />
    </div>
  );
}

/** The grid on lg; below it, the day card (day picker and Full in its header, then student rows). */
export function ParticipationWeekSkeleton() {
  return (
    <div aria-hidden className="min-w-0">
      <TableSkeleton rows={8} columns={["w-2/3", "w-12", "w-12", "w-12", "w-1/2", "w-16"]} className="max-lg:hidden" />
      <div className="overflow-hidden rounded-md border border-border bg-card lg:hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Skeleton className="h-10 w-40 rounded-md md:h-9 sm:w-56" />
          <Skeleton className="ml-auto h-3 w-10" />
          <Skeleton className="h-10 w-16 rounded-md md:h-9" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex min-h-14 items-center gap-2 px-4 py-2">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className={index % 3 === 1 ? "h-3.5 w-1/2" : "h-3.5 w-2/3"} />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-10 w-16 shrink-0 rounded-md" />
              <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
              <Skeleton className="h-10 w-20 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
