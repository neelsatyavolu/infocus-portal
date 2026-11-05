import { Skeleton } from "@/components/kit/skeleton";

/** The roster card: search and sort, the filter chips, then member rows. */
function RosterSkeleton() {
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border bg-card">
      <div className="space-y-2 border-b border-border px-4 py-3">
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 rounded-md md:h-9" />
          <Skeleton className="h-10 w-10 rounded-md md:h-9 md:w-9" />
        </div>
        <Skeleton className="h-10 w-64 max-w-full rounded-md md:h-9" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={index % 3 === 1 ? "h-3.5 w-1/2" : "h-3.5 w-2/3"} />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-1.5 w-12 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Roster on the left, the selected person's note on the right (roster only on phones). */
export function MembersBodySkeleton() {
  return (
    <div aria-hidden className="grid min-w-0 items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <RosterSkeleton />
      <div className="space-y-5 rounded-md border border-border bg-card p-5 max-lg:hidden">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-40 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
