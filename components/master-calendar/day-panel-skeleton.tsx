import { Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";

/** Field placeholders for the Day panel's sections (two labelled pairs of h-9 fields). */
export function DaySectionsSkeleton() {
  return (
    <div aria-hidden className="space-y-5">
      {[0, 1].map((index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** The docked Day panel's shape: a header bar (date and tags), then its sections. */
export function DayPanelSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex-col overflow-hidden rounded-md border border-border bg-card", className)}>
      <div className="space-y-2 border-b border-border p-4">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="p-4">
        <DaySectionsSkeleton />
      </div>
    </div>
  );
}
