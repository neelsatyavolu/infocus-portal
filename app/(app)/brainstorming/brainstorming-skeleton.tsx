import { LoadingRegion, PageHeaderSkeleton, PanelSkeleton, Skeleton } from "@/components/kit/skeleton";
import { PROOF_OF_CONTACT_SLOTS } from "@/src/lib/package-brainstorm";

export const LOADING_LABEL = "Loading your packages…";

/**
 * Same shape and order as the page body (PackageWorkspace) in its usual state (PENDING), so
 * nothing jumps when the data arrives: the materials beside the rail (Where it stands, Feedback)
 * from xl; below xl the materials, Where it stands, then Feedback, which waits at the bottom
 * until it has notes.
 */
export function BrainstormingBodySkeleton() {
  return (
    <div aria-hidden className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-4 max-xl:order-1">
        <div>
          <div className="flex min-h-8 items-center">
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="my-0.5 h-3.5 w-4/5" />
        </div>
        <div className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
              {PROOF_OF_CONTACT_SLOTS.map((slot) => (
                <div key={slot} className="flex items-center gap-3 rounded-md border border-border p-2 sm:block sm:p-0">
                  <Skeleton className="h-16 w-16 shrink-0 rounded-md sm:h-36 sm:w-full sm:rounded-none" />
                  <div className="flex-1 sm:flex sm:h-11 sm:items-center sm:border-t sm:border-border sm:px-3">
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Skeleton className="h-10 flex-1 rounded-md md:h-9" />
              <Skeleton className="h-10 rounded-md sm:w-28 md:h-9" />
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-5 max-xl:contents">
        <PanelSkeleton rows={1} className="max-xl:order-2" />
        <PanelSkeleton rows={2} className="max-xl:order-5" />
      </div>
    </div>
  );
}

/** The route's loading view (loading.tsx): header plate, then the body skeleton. */
export function BrainstormingSkeleton() {
  return (
    <LoadingRegion label={LOADING_LABEL} className="route-enter space-y-5 lg:pb-18">
      <PageHeaderSkeleton actions={2} />
      <BrainstormingBodySkeleton />
    </LoadingRegion>
  );
}
