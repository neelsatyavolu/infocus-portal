import type { ReactNode } from "react";
import { LoadingRegion, PageHeaderSkeleton, Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";

/**
 * A flush panel: header row (title, optional tag, optional h-8 action of `action` width) over a
 * rule, then the body.
 */
function PanelBlock({
  tag = true,
  action,
  className,
  children
}: {
  tag?: boolean;
  action?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div aria-hidden className={cn("flex h-full min-w-0 flex-col rounded-md border border-border bg-card", className)}>
      <div className="flex min-h-14 items-center gap-2 border-b border-border px-4 py-3 md:px-5">
        <Skeleton className="h-4 w-24" />
        {tag ? <Skeleton className="h-5 w-16" /> : null}
        {action ? <Skeleton className={cn("ml-auto h-8 rounded-md", action)} /> : null}
      </div>
      {children}
    </div>
  );
}

/** Cast: Show manager (label row, picker, rotation line) and Anchors (label row, two pickers). */
function CastBlock() {
  return (
    <PanelBlock tag={false}>
      <div className="space-y-3 px-4 py-4 md:px-5">
        <div className="flex min-h-8 items-center gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="@container space-y-3 border-t border-border px-4 py-4 md:px-5">
        <div className="flex min-h-8 items-center gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="ml-auto h-8 w-24 rounded-md" />
        </div>
        <div className="grid gap-3 @xs:grid-cols-2">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-9 w-full rounded-md" />
          ))}
        </div>
      </div>
    </PanelBlock>
  );
}

/** Show roles: one 48px row per crew role. */
function RolesBlock() {
  return (
    <PanelBlock action="w-32">
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex min-h-12 items-center gap-3 px-4 md:px-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-5 w-20" />
          </div>
        ))}
      </div>
    </PanelBlock>
  );
}

/** Packages: the show's two 56px rows, side by side from a wide card. */
function PackagesBlock() {
  return (
    <PanelBlock action="w-32" className="@container @3xl:col-span-2">
      <div className="grid gap-px bg-border @2xl:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="flex min-h-14 items-center gap-3 bg-card px-4 md:px-5">
            <Skeleton className="h-3 w-5" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </PanelBlock>
  );
}

/** The overview's shape while it loads (header, show strip, the three panels), so nothing jumps. */
export function ShowSkeleton() {
  return (
    <LoadingRegion label="Loading the show" className="@container space-y-5">
      <PageHeaderSkeleton actions={2} />
      <div aria-hidden className="grid auto-cols-[minmax(6.5rem,1fr)] grid-flow-col gap-2 overflow-hidden">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-16 rounded-md" />
        ))}
      </div>
      <div className="grid gap-5 @3xl:grid-cols-2">
        <CastBlock />
        <RolesBlock />
        <PackagesBlock />
      </div>
    </LoadingRegion>
  );
}

/** The generator app while its code loads. */
export function GeneratorAppSkeleton() {
  return (
    <LoadingRegion label="Loading the generator">
      <Skeleton className="h-[60vh] w-full rounded-md" />
    </LoadingRegion>
  );
}

/** The whole generator view before the page knows its mode: the back link and the app block. */
export function GeneratorSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40 rounded-md" />
      <GeneratorAppSkeleton />
    </div>
  );
}
