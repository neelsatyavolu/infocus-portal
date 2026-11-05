import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";

/**
 * The review page while it loads, shaped like the real one so nothing jumps: the compact header
 * plate (eyebrow + tag, title + version picker, then the approval strip or one line, actions),
 * then from 1024px the viewport-high split (player card | 14px splitter | panel), stacked below.
 */
export function ReviewSkeleton({ guest = false }: { guest?: boolean }) {
  return (
    <LoadingRegion label="Loading review" className="flex flex-col gap-4 lg:h-[calc(100dvh-7.5rem)]">
      <div aria-hidden className="brand-hero-panel flex flex-wrap items-end gap-x-6 gap-y-4 px-4 py-4 md:px-6">
        <div className="min-w-0 flex-[1_1_420px]">
          <div className="flex min-h-5 items-center gap-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <Skeleton className="h-6 w-64 max-w-full" />
            <Skeleton className="hidden h-9 w-40 rounded-md lg:block" />
          </div>
          <Skeleton className={guest ? "mt-1.5 h-3.5 w-80 max-w-full" : "mt-1.5 h-3.5 w-80 max-w-full lg:hidden"} />
          {guest ? null : (
            <div className="mt-3 hidden max-w-3xl grid-cols-3 gap-2 lg:grid">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          )}
        </div>
        {guest ? null : (
          <div className="hidden gap-2 lg:flex">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        )}
      </div>

      <div aria-hidden className="flex flex-col gap-4 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_14px_minmax(320px,420px)] lg:gap-0">
        <div className="space-y-4 lg:min-h-0 lg:pr-2">
          <div className="rounded-md border border-border bg-card p-2 sm:p-4 max-lg:portrait:rounded-none max-lg:portrait:border-x-0 max-lg:portrait:p-0 lg:flex lg:h-full lg:flex-col lg:justify-center">
            <Skeleton aspect="16/9" className="rounded-md max-lg:portrait:rounded-none" />
            <div className="mt-2 space-y-2 px-1 sm:px-2 max-lg:portrait:pb-2">
              <Skeleton className="h-1.5 w-full rounded-full" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-28" />
                <span className="flex-1" />
                <Skeleton className="h-8 w-12 rounded-md" />
              </div>
            </div>
          </div>
          <div className="flex gap-2 lg:hidden">
            <Skeleton className="h-10 flex-1 rounded-md" />
            <Skeleton className="h-10 w-10 rounded-md" />
          </div>
        </div>

        <span className="hidden lg:block" />

        <div className="flex min-h-[28rem] flex-col rounded-md border border-border bg-card lg:ml-2 lg:min-h-0">
          <div className="flex h-10 items-center gap-6 border-b border-border px-4">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <Skeleton className="h-8 w-48 rounded-md" />
            <span className="flex-1" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
          <div className="flex-1 space-y-2 overflow-hidden px-4 py-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-3.5 w-24" />
                  <span className="flex-1" />
                  <Skeleton className="h-3 w-6" />
                </div>
                <div className="mt-2 space-y-1.5 pl-8">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className={index % 2 ? "h-3.5 w-1/2" : "h-3.5 w-3/4"} />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-border px-4 py-3">
            <Skeleton className="h-14 w-full rounded-md" />
            <div className="flex h-9 items-center justify-between">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-9 w-20 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
