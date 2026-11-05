import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { ENTRY_CONTROL, ENTRY_PAD_X } from "@/components/public-entry/entry-panel";
import { cn } from "@/src/lib/utils";
import { ChannelCardSkeleton, ChannelGrid } from "./channel-cards";

/** A section heading line (the SectionHeader's 32px row). */
function HeadingSkeleton({ width }: { width: string }) {
  return (
    <div className="flex min-h-8 items-center">
      <Skeleton className={cn("h-5", width)} />
    </div>
  );
}

/**
 * Onboarding while it loads, in the loaded layout: Profile (the Nickname row with its input) and
 * Notifications (the Email and Browser cards).
 */
export function OnboardingSkeleton() {
  return (
    <LoadingRegion label="Loading onboarding" className="space-y-5">
      <div className="space-y-3">
        <HeadingSkeleton width="w-20" />
        <div aria-hidden className="rounded-md border border-border bg-card">
          <div className={cn(ENTRY_PAD_X, "flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6")}>
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <Skeleton className={cn(ENTRY_CONTROL, "w-full shrink-0 rounded-md sm:w-64")} />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <HeadingSkeleton width="w-32" />
        <ChannelGrid>
          <ChannelCardSkeleton />
          <ChannelCardSkeleton />
        </ChannelGrid>
      </div>
    </LoadingRegion>
  );
}
