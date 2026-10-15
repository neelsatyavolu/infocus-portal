import { CardGrid } from "@/components/kit/layout";
import { Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";

const ROWS = 8;
const FIELDS = 4;

/** Field rows in the label | value | [reveal][copy] columns of the real ones. */
function FieldRowsSkeleton({ count }: { count: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="grid min-h-14 grid-cols-[7rem_minmax(0,1fr)_4.25rem] items-center gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className={cn("h-4", index % 2 ? "w-28" : "w-44")} />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

function DetailHeaderSkeleton({ actions, className }: { actions: boolean; className?: string }) {
  return (
    <div className={cn("flex items-start gap-4 border-b border-border p-4 md:p-5", className)}>
      <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
      <span className="flex-1 space-y-2">
        <Skeleton className="h-5 w-48 max-w-full" />
        <Skeleton className="h-3.5 w-32" />
      </span>
      {actions ? <Skeleton className="h-8 w-36 rounded-md" /> : null}
    </div>
  );
}

/**
 * The vault panel while it loads, in the same shape as the real one. Container queries follow
 * the page's layouts: rows with a sticky search and a chips/count row (narrow); from 56rem the
 * list with its own search-and-chips header beside the detail, whose header is just as tall
 * (`--vault-toolbar-h`, as in the browser); and the Recent activity rail beside the fields
 * from 70rem.
 */
export function VaultPanelSkeleton() {
  return (
    <div aria-hidden className="@container min-w-0">
      <div className="overflow-hidden rounded-md border border-border bg-card [--vault-toolbar-h:6.75rem] lg:pointer-fine:[--vault-toolbar-h:6.3125rem] @[56rem]:grid @[56rem]:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="min-w-0 @[56rem]:border-r @[56rem]:border-border">
          <div className="border-b border-border p-3 @[56rem]:flex @[56rem]:min-h-[var(--vault-toolbar-h)] @[56rem]:flex-col @[56rem]:justify-center @[56rem]:gap-2">
            <Skeleton className="h-10 w-full rounded-md md:h-9" />
            <div className="hidden h-8 items-center @[56rem]:flex">
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex min-h-12 items-center justify-end border-b border-border px-3 py-1 @[56rem]:hidden">
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: ROWS }, (_, index) => (
              <div key={index} className="grid h-16 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 px-3 @[56rem]:h-14">
                <Skeleton className="h-9 w-9 rounded-md" />
                <span className="space-y-2">
                  <Skeleton className={cn("h-3.5", index % 3 === 1 ? "w-1/2" : "w-2/3")} />
                  <Skeleton className="h-3 w-1/3" />
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="hidden min-w-0 @[56rem]:block">
          <DetailHeaderSkeleton actions className="min-h-[var(--vault-toolbar-h)] items-center" />
          <div className="px-5 pb-5 @[70rem]:grid @[70rem]:grid-cols-[minmax(0,40rem)_minmax(16rem,1fr)] @[70rem]:gap-6">
            <FieldRowsSkeleton count={FIELDS} />
            <div className="hidden space-y-3 border-l border-border pl-6 pt-4 @[70rem]:block">
              <Skeleton className="h-3 w-28" />
              {[0, 1, 2].map((row) => (
                <div key={row} className="space-y-1.5">
                  <Skeleton className={cn("h-3.5", row === 1 ? "w-1/2" : "w-2/3")} />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A shared viewer's search, count and cards while they load. */
export function VaultCardsSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Skeleton className="h-10 w-full rounded-md sm:w-72 md:h-9" />
        <Skeleton className="h-3 w-28" />
      </div>
      <CardGrid minItemWidth="28rem">
        {[0, 1].map((card) => (
          <div key={card} className="rounded-md border border-border bg-card">
            <DetailHeaderSkeleton actions={false} />
            <div className="px-4 pb-4 md:px-5 md:pb-5">
              <FieldRowsSkeleton count={3} />
            </div>
          </div>
        ))}
      </CardGrid>
    </div>
  );
}
