import { LoadingRegion, PageHeaderSkeleton, Skeleton } from "@/components/kit/skeleton";

const COLUMNS = ["w-28", "w-10", "w-10", "w-10", "w-10", "w-14", "w-16", "w-20", "w-14", "w-20", "w-24"];

/** Grade Editor route skeleton (its view tabs live in the top bar): header plate, and one work panel (toolbar + table rows). */
export default function Loading() {
  return (
    <LoadingRegion label="Loading Grade Editor" className="space-y-5">
      <PageHeaderSkeleton actions={2} />
      <div aria-hidden className="overflow-hidden rounded-md border border-border bg-card">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-72 max-w-full rounded-md" />
            <Skeleton className="h-9 w-36 rounded-md" />
            <span className="flex-1" />
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-24 rounded-md" />
            ))}
          </div>
        </div>
        <div className="overflow-hidden">
          {Array.from({ length: 8 }, (_, row) => (
            <div key={row} className="flex h-12 items-center gap-4 border-b border-border px-3 last:border-b-0">
              {COLUMNS.map((width, index) => (
                <Skeleton key={index} className={`h-3.5 shrink-0 ${width} ${index > 4 ? "max-lg:hidden" : ""}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
